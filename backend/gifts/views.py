from django.conf import settings
from django.db import transaction
from django.utils.dateparse import parse_datetime
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from events.permissions import IsEventMember

from .models import Gift
from .serializers import GiftSerializer
from .services.sync import sync_transactions


def _check_version(request, gift: Gift):
    """Optimistic concurrency: the client must echo the `updated_at` it last saw."""
    raw = request.data.get("updated_at")
    seen = parse_datetime(raw) if isinstance(raw, str) else None
    if seen is None:
        raise ValidationError({"updated_at": "Send the gift's current updated_at value."})
    if seen != gift.updated_at:
        return Response(
            {"detail": "This gift was changed by someone else.", "current": GiftSerializer(gift).data},
            status=status.HTTP_409_CONFLICT,
        )
    return None


class GiftViewSet(
    mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet
):
    """Online gift list and corrections. Gifts are created only through `/gifts/sync/`."""

    serializer_class = GiftSerializer
    permission_classes = [IsEventMember]
    http_method_names = ["get", "patch", "post", "head", "options"]

    def get_queryset(self):
        qs = Gift.objects.filter(event_id=self.kwargs["event_pk"]).select_related("guest", "recorded_by")
        params = self.request.query_params
        if params.get("guest"):
            qs = qs.filter(guest_id=params["guest"])
        if params.get("method"):
            qs = qs.filter(method=params["method"])
        if params.get("include_voided") != "1":
            qs = qs.filter(voided=False)
        return qs

    def get_object(self):
        if self.request.method == "GET":
            return super().get_object()
        # Writes lock the row so the version check and the update are atomic.
        obj = Gift.objects.select_for_update().get(event_id=self.kwargs["event_pk"], pk=self.kwargs["pk"])
        self.check_object_permissions(self.request, obj)
        return obj

    @transaction.atomic
    def partial_update(self, request, *args, **kwargs):
        try:
            gift = self.get_object()
        except Gift.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        conflict = _check_version(request, gift)
        if conflict:
            return conflict
        data = {k: v for k, v in request.data.items() if k != "updated_at"}
        ser = self.get_serializer(gift, data=data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data)

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def void(self, request, *args, **kwargs):
        try:
            gift = self.get_object()
        except Gift.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        conflict = _check_version(request, gift)
        if conflict:
            return conflict
        gift.voided = True
        gift.save(update_fields=["voided", "updated_at"])
        return Response(GiftSerializer(gift).data)


class GiftSyncView(APIView):
    """POST {"transactions": [...]} → 200 {"results": [...]} with one result per item."""

    def post(self, request):
        items = request.data.get("transactions") if isinstance(request.data, dict) else None
        if not isinstance(items, list) or not items:
            return Response(
                {"detail": "Body must be {\"transactions\": [...]} with at least one item.", "code": "bad_envelope"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(items) > settings.GIFT_SYNC_MAX_BATCH:
            return Response(
                {"detail": f"At most {settings.GIFT_SYNC_MAX_BATCH} transactions per request.", "code": "batch_too_large"},
                status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            )
        return Response({"results": sync_transactions(request.user, items)})
