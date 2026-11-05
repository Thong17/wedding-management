from django.conf import settings
from django.db import transaction
from django.db.models import Count, Sum
from django.utils.dateparse import parse_datetime
from django.shortcuts import get_object_or_404
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
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

    # Any gift / only gifts the user recorded, per action. The server's gift list is for reconciling:
    # people who can correct any gift or see the report. One gift can also be read by whoever may
    # correct it (the desk reads it before an edit or void).
    RULES = {
        "list": ((Permission.GIFT_EDIT, Permission.GIFT_VOID, Permission.REPORT_VIEW), ()),
        "retrieve": (
            (Permission.GIFT_EDIT, Permission.GIFT_VOID, Permission.REPORT_VIEW),
            (Permission.GIFT_EDIT_OWN, Permission.GIFT_VOID_OWN),
        ),
        "partial_update": ((Permission.GIFT_EDIT,), (Permission.GIFT_EDIT_OWN,)),
        "void": ((Permission.GIFT_VOID,), (Permission.GIFT_VOID_OWN,)),
    }

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)  # authentication, lock check
        event = get_object_or_404(Event, pk=self.kwargs["event_pk"])
        any_gift, own_gifts = self.RULES.get(self.action, ((Permission.GIFT_EDIT,), ()))
        perms = access.require(request.user, event, any_of=any_gift + own_gifts)
        self.any_gift = bool(perms.intersection(any_gift))

    def check_object_permissions(self, request, obj):
        super().check_object_permissions(request, obj)
        # Allowed only for own gifts: someone else's is refused.
        if not self.any_gift and obj.recorded_by_id != request.user.id:
            raise PermissionDenied("Your role on this event only allows this for gifts you recorded.")

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


# Who may see other desks' gifts (amounts, who recorded them) at the desk. Editing or voiding any gift
# and the report already show every gift on the event's page, so they count too.
SEE_ALL_GIFTS = (Permission.GIFT_VIEW_ALL, Permission.GIFT_EDIT, Permission.GIFT_VOID, Permission.REPORT_VIEW)
# Who may see the event's gift total at the desk (the report has it too).
SEE_TOTAL = (Permission.GIFT_VIEW_TOTAL, Permission.REPORT_VIEW)


def _desk_gifts(request, event_pk):
    """The event's gifts, for anyone with access to its desk, gifts or report; and the user's
    permissions on the event."""
    event = get_object_or_404(Event, pk=event_pk)
    perms = access.require(request.user, event, any_of=(Permission.GIFT_DESK, *SEE_ALL_GIFTS, *SEE_TOTAL))
    return Gift.objects.filter(event=event), perms


class GiftDeskFeedView(APIView):
    """GET → what every gift desk on an event shares, so desks see each other's work:

    - `marks`: guests that already have gifts, as [{"guest": id, "count": n}] (voided gifts and walk-ins
      left out), for the "gift recorded" badges and the repeat-gift warning;
    - `totals`: {"count": n, "total": "amount"} over every gift not voided (item gifts count but add no
      money), for the desk's event-wide total;
    - `recent`: the latest gifts from all desks (newest first, voided ones included and flagged), with
      who recorded each.

    For anyone with access to the event's desk, gifts or report. `recent` only for those who may see
    all desks' gifts (otherwise empty), `totals` only for those who may see the total (otherwise null):
    a desk without them sees just its own gifts, but still which guests are already marked. Read-only:
    corrections need the edit / void permissions on the gift endpoints.
    """

    RECENT_LIMIT = 30

    def get(self, request, event_pk):
        gifts, perms = _desk_gifts(request, event_pk)
        marks = (
            gifts.filter(voided=False, guest__isnull=False)
            .values("guest")
            .annotate(count=Count("id"))
            .order_by("guest")
        )
        feed = {"marks": [{"guest": r["guest"], "count": r["count"]} for r in marks], "totals": None, "recent": []}
        if perms.intersection(SEE_TOTAL):
            totals = gifts.filter(voided=False).aggregate(count=Count("id"), total=Sum("amount"))
            feed["totals"] = {"count": totals["count"], "total": f"{totals['total'] or 0:.2f}"}
        if perms.intersection(SEE_ALL_GIFTS):
            recent = gifts.select_related("guest", "recorded_by").order_by("-client_created_at", "-id")[: self.RECENT_LIMIT]
            feed["recent"] = GiftSerializer(recent, many=True).data
        return Response(feed)


class GiftDeskListView(APIView):
    """GET → every gift on the event from all desks (newest first, voided ones included and flagged),
    for the desk's "All gifts" and "Voided" tabs. Only for those who may see all desks' gifts; read-only."""

    def get(self, request, event_pk):
        gifts, perms = _desk_gifts(request, event_pk)
        if not perms.intersection(SEE_ALL_GIFTS):
            raise PermissionDenied(f"Your role on this event doesn't allow: {Permission.GIFT_VIEW_ALL.label}.")
        gifts = gifts.select_related("guest", "recorded_by").order_by("-client_created_at", "-id")
        return Response(GiftSerializer(gifts, many=True).data)
