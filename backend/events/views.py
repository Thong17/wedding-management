import csv
import io

from django.db import transaction
from django.db.models import Count, Q, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from .models import Event, EventMembership, Guest
from .permissions import IsEventMember, IsEventOwnerOrReadOnly, is_owner
from .serializers import (
    AddMemberSerializer,
    EventSerializer,
    GuestSerializer,
    MembershipSerializer,
)

CSV_FIELDS = ["full_name", "nickname", "phone", "side", "group", "table_no"]


class EventViewSet(viewsets.ModelViewSet):
    serializer_class = EventSerializer
    permission_classes = [IsEventOwnerOrReadOnly]

    def get_queryset(self):
        return (
            Event.objects.filter(memberships__user=self.request.user)
            .prefetch_related("memberships")
            .distinct()
        )

    @transaction.atomic
    def perform_create(self, serializer):
        event = serializer.save(created_by=self.request.user)
        EventMembership.objects.create(
            event=event, user=self.request.user, role=EventMembership.Role.OWNER
        )

    def perform_destroy(self, instance):
        if instance.gifts.exists():
            raise ValidationError({"detail": "Cannot delete an event that has recorded gifts."})
        instance.delete()

    @action(detail=True, methods=["get", "post"])
    def members(self, request, pk=None):
        event = self.get_object()
        if request.method == "GET":
            return Response(MembershipSerializer(event.memberships.select_related("user"), many=True).data)
        if not is_owner(request.user, event.pk):
            return Response(status=status.HTTP_403_FORBIDDEN)
        ser = AddMemberSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        membership, _ = EventMembership.objects.update_or_create(
            event=event, user=ser.validated_data["username"], defaults={"role": ser.validated_data["role"]}
        )
        return Response(MembershipSerializer(membership).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["delete"], url_path=r"members/(?P<user_id>\d+)")
    def remove_member(self, request, pk=None, user_id=None):
        event = self.get_object()
        if not is_owner(request.user, event.pk):
            return Response(status=status.HTTP_403_FORBIDDEN)
        if int(user_id) == request.user.id:
            raise ValidationError({"detail": "You cannot remove yourself."})
        EventMembership.objects.filter(event=event, user_id=user_id).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["get"])
    def report(self, request, pk=None):
        event = self.get_object()
        gifts = event.gifts.filter(voided=False)
        totals = gifts.aggregate(count=Count("id"), total=Sum("amount"))
        by_method = list(gifts.values("method").annotate(count=Count("id"), total=Sum("amount")).order_by("method"))
        by_side = list(
            gifts.filter(guest__isnull=False)
            .values("guest__side")
            .annotate(count=Count("id"), total=Sum("amount"))
            .order_by("guest__side")
        )
        walk_in = gifts.filter(guest__isnull=True).aggregate(count=Count("id"), total=Sum("amount"))
        guests = event.guests.filter(is_deleted=False)
        by_guest = list(
            guests.annotate(
                gift_count=Count("gifts", filter=Q(gifts__voided=False)),
                gift_total=Sum("gifts__amount", filter=Q(gifts__voided=False)),
            )
            .values("id", "full_name", "side", "group", "gift_count", "gift_total")
            .order_by("full_name")
        )
        return Response(
            {
                "event_id": event.pk,
                "currency": event.currency,
                "count": totals["count"],
                "total": totals["total"] or 0,
                "by_method": by_method,
                "by_side": [{"side": r["guest__side"], "count": r["count"], "total": r["total"]} for r in by_side],
                "walk_in": {"count": walk_in["count"], "total": walk_in["total"] or 0},
                "guests_total": guests.count(),
                "guests_with_gift": sum(1 for g in by_guest if g["gift_count"]),
                "by_guest": by_guest,
            }
        )


class GuestViewSet(viewsets.ModelViewSet):
    serializer_class = GuestSerializer
    permission_classes = [IsEventMember]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_event(self):
        return get_object_or_404(Event, pk=self.kwargs["event_pk"])

    def get_queryset(self):
        return Guest.objects.filter(event_id=self.kwargs["event_pk"])

    def list(self, request, *args, **kwargs):
        """Full list, or a delta (including tombstones) when `updated_since` is given.

        `server_time` is captured before querying so the client can use it as the
        next `updated_since` without missing rows written during this request.
        """
        server_time = timezone.now()
        qs = self.get_queryset()
        since_raw = request.query_params.get("updated_since")
        if since_raw:
            since = parse_datetime(since_raw)
            if since is None:
                raise ValidationError({"updated_since": "Invalid ISO datetime."})
            qs = qs.filter(updated_at__gte=since)
        else:
            qs = qs.filter(is_deleted=False)
        return Response(
            {
                "server_time": server_time.isoformat(),
                "full": not since_raw,
                "results": self.get_serializer(qs, many=True).data,
            }
        )

    def perform_create(self, serializer):
        serializer.save(event=self.get_event())

    def perform_destroy(self, instance):
        # Soft delete so offline clients receive a tombstone and existing gifts stay valid.
        instance.is_deleted = True
        instance.deleted_at = timezone.now()
        instance.save(update_fields=["is_deleted", "deleted_at", "updated_at"])

    @action(detail=False, methods=["post"], url_path="import")
    def import_csv(self, request, event_pk=None):
        event = self.get_event()
        upload = request.FILES.get("file")
        if upload is None:
            raise ValidationError({"file": "Upload a CSV file in the 'file' field."})
        try:
            text = upload.read().decode("utf-8-sig")
        except UnicodeDecodeError:
            raise ValidationError({"file": "CSV must be UTF-8 encoded."})
        reader = csv.DictReader(io.StringIO(text))
        if not reader.fieldnames or "full_name" not in [f.strip() for f in reader.fieldnames]:
            raise ValidationError({"file": f"CSV header must include full_name. Allowed: {', '.join(CSV_FIELDS)}"})

        created, errors = 0, []
        with transaction.atomic():
            for line_no, row in enumerate(reader, start=2):
                data = {k.strip(): (v or "").strip() for k, v in row.items() if k and k.strip() in CSV_FIELDS}
                if not data.get("side"):
                    data.pop("side", None)
                ser = GuestSerializer(data=data)
                if ser.is_valid():
                    ser.save(event=event)
                    created += 1
                else:
                    errors.append({"row": line_no, "errors": ser.errors})
        return Response({"created": created, "errors": errors}, status=status.HTTP_201_CREATED)
