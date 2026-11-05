from django.conf import settings
from django.db import transaction
from django.db.models import Count, Sum
from django.utils.dateparse import parse_datetime
from django.shortcuts import get_object_or_404
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from events import access
from events.models import Event, Permission

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
    http_method_names = ["get", "patch", "post", "head", "options"]

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)  # authentication, lock check
        event = get_object_or_404(Event, pk=self.kwargs["event_pk"])
        if self.action in ("list", "retrieve"):
            # The server's gift list is for reconciling: people who can correct gifts or see the report.
            access.require(request.user, event, any_of=(Permission.GIFT_EDIT, Permission.REPORT_VIEW))
        else:
            access.require(request.user, event, permission=Permission.GIFT_EDIT)

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
    """POST {"transactions": [...]} → 200 {"results": [...]} with one result per item.

    Deliberately allowed for locked logins (no NotLocked): gifts already recorded on a device must
    always be able to upload, so a trial ending never loses data.
    """

    permission_classes = [IsAuthenticated]

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


class GiftDeskFeedView(APIView):
    """GET → what every gift desk on an event shares, so desks see each other's work:

    - `marks`: guests that already have gifts, as [{"guest": id, "count": n}] (voided gifts and walk-ins
      left out), for the "gift recorded" badges and the repeat-gift warning;
    - `totals`: {"count": n, "total": "amount"} over every gift not voided (item gifts count but add no
      money), for the desk's event-wide total;
    - `recent`: the latest gifts from all desks (newest first, voided ones included and flagged), with
      who recorded each.

    For anyone with access to the event's desk, gifts or report. Read-only: corrections still need
    the gift_edit permission on the gift endpoints.
    """

    RECENT_LIMIT = 30

    def get(self, request, event_pk):
        event = get_object_or_404(Event, pk=event_pk)
        access.require(request.user, event, any_of=(Permission.GIFT_DESK, Permission.GIFT_EDIT, Permission.REPORT_VIEW))
        gifts = Gift.objects.filter(event=event)
        marks = (
            gifts.filter(voided=False, guest__isnull=False)
            .values("guest")
            .annotate(count=Count("id"))
            .order_by("guest")
        )
        totals = gifts.filter(voided=False).aggregate(count=Count("id"), total=Sum("amount"))
        recent = gifts.select_related("guest", "recorded_by").order_by("-client_created_at", "-id")[: self.RECENT_LIMIT]
        return Response(
            {
                "marks": [{"guest": r["guest"], "count": r["count"]} for r in marks],
                "totals": {"count": totals["count"], "total": f"{totals['total'] or 0:.2f}"},
                "recent": GiftSerializer(recent, many=True).data,
            }
        )
