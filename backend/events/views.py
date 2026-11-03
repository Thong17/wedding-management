import csv
import io

from django.db import transaction
from django.db.models import Count, Q, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from gifts.models import Gift

from . import access
from .models import DEFAULT_ROLE_NAME, Event, EventAssignment, Guest, Permission, Role
from .serializers import AssignmentSerializer, AssignSerializer, EventSerializer, GuestSerializer, RoleSerializer

CSV_FIELDS = ["full_name", "nickname", "phone", "side", "group", "table_no"]


class EventViewSet(viewsets.ModelViewSet):
    """Events the user can see (access.visible_events). Hidden events are 404, not 403."""

    serializer_class = EventSerializer

    def get_queryset(self):
        return access.visible_events(self.request.user).select_related("client")

    def perform_create(self, serializer):
        user = self.request.user
        if not access.can_create_events(user):
            raise PermissionDenied("Only client admins and the platform admin can create events.")
        if access.is_platform_admin(user):
            serializer.save(created_by=user)  # client chosen in the request (or none)
        else:
            serializer.save(created_by=user, client_id=access.client_admin_of(user))

    def perform_update(self, serializer):
        access.require(self.request.user, serializer.instance, full=True)
        serializer.save()

    def perform_destroy(self, instance):
        access.require(self.request.user, instance, full=True)
        if instance.gifts.exists():
            raise ValidationError({"detail": "Cannot delete an event that has recorded gifts."})
        instance.delete()

    # --- People on the event. `assignments` is the API; `members` keeps the current Managers tab working.

    def _assignments(self, event):
        return EventAssignment.objects.filter(event=event).select_related("user", "role").order_by("user__username")

    def _assign(self, request, event):
        access.require(request.user, event, full=True)
        ser = AssignSerializer(data=request.data, context={"request": request, "event": event})
        ser.is_valid(raise_exception=True)
        assignment, _ = EventAssignment.objects.update_or_create(
            event=event,
            user=ser.validated_data["user"],
            defaults={"role": ser.validated_data["role"], "assigned_by": request.user},
        )
        return Response(AssignmentSerializer(assignment).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get", "post"])
    def assignments(self, request, pk=None):
        event = self.get_object()
        if request.method == "POST":
            return self._assign(request, event)
        access.require(request.user, event, full=True)
        return Response(AssignmentSerializer(self._assignments(event), many=True).data)

    @action(detail=True, methods=["patch", "delete"], url_path=r"assignments/(?P<assignment_id>\d+)")
    def assignment_detail(self, request, pk=None, assignment_id=None):
        event = self.get_object()
        access.require(request.user, event, full=True)
        assignment = get_object_or_404(EventAssignment, pk=assignment_id, event=event)
        if request.method == "DELETE":
            assignment.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        ser = AssignSerializer(
            data={"user_id": assignment.user_id, **request.data}, context={"request": request, "event": event}
        )
        ser.is_valid(raise_exception=True)
        assignment.role = ser.validated_data["role"]
        assignment.assigned_by = request.user
        assignment.save(update_fields=["role", "assigned_by"])
        return Response(AssignmentSerializer(assignment).data)

    @action(detail=True, methods=["get", "post"])
    def members(self, request, pk=None):
        event = self.get_object()
        if request.method == "POST":
            return self._assign(request, event)
        return Response(AssignmentSerializer(self._assignments(event), many=True).data)

    @action(detail=True, methods=["delete"], url_path=r"members/(?P<user_id>\d+)")
    def remove_member(self, request, pk=None, user_id=None):
        event = self.get_object()
        access.require(request.user, event, full=True)
        EventAssignment.objects.filter(event=event, user_id=user_id).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["get"])
    def report(self, request, pk=None):
        event = self.get_object()
        access.require(request.user, event, permission=Permission.REPORT_VIEW)
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
        # Item gifts have no amount, so every Sum above is money only; list the items separately.
        items = [
            {"guest_id": g.guest_id, "name": g.guest.full_name if g.guest_id else g.walk_in_name, "item": g.item}
            for g in gifts.filter(method=Gift.Method.ITEM).select_related("guest").order_by("client_created_at")
        ]
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
                "items": items,
                "guests_total": guests.count(),
                "guests_with_gift": sum(1 for g in by_guest if g["gift_count"]),
                "by_guest": by_guest,
            }
        )


class GuestViewSet(viewsets.ModelViewSet):
    """Reading guests needs any access to the event (the gift desk needs the list); changes need the role's permission."""

    serializer_class = GuestSerializer
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    ACTION_PERMISSIONS = {
        "create": Permission.GUEST_ADD,
        "update": Permission.GUEST_EDIT,
        "partial_update": Permission.GUEST_EDIT,
        "destroy": Permission.GUEST_DELETE,
        "import_csv": Permission.GUEST_IMPORT,
    }

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)  # authentication, lock check
        self.event = get_object_or_404(Event, pk=self.kwargs["event_pk"])
        access.require(request.user, self.event, permission=self.ACTION_PERMISSIONS.get(self.action))

    def get_event(self):
        return self.event

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


class RoleViewSet(viewsets.ModelViewSet):
    """Platform admin: global roles and every client's roles (to fix mistakes). Client admin: uses global
    roles, fully manages their own. Customers have no access."""

    serializer_class = RoleSerializer

    def check_permissions(self, request):
        super().check_permissions(request)
        if not (access.is_platform_admin(request.user) or access.client_admin_of(request.user)):
            raise PermissionDenied("Only client admins and the platform admin can manage roles.")

    def get_queryset(self):
        user = self.request.user
        qs = Role.objects.select_related("client", "updated_by").annotate(usage_count=Count("assignments"))
        if not access.is_platform_admin(user):
            qs = qs.filter(Q(client__isnull=True) | Q(client_id=access.client_admin_of(user)))
        scope = self.request.query_params.get("client")
        if scope == "global":
            qs = qs.filter(client__isnull=True)
        elif scope:
            qs = qs.filter(Q(client__isnull=True) | Q(client_id=scope))
        return qs

    def _check_editable(self, role):
        user = self.request.user
        if access.is_platform_admin(user):
            return
        if role.client_id is None or role.client_id != access.client_admin_of(user):
            raise PermissionDenied("Only the platform admin can change global roles.")

    def perform_create(self, serializer):
        user = self.request.user
        if access.is_platform_admin(user):
            serializer.save(updated_by=user)
        else:
            serializer.save(updated_by=user, client_id=access.client_admin_of(user))

    def perform_update(self, serializer):
        role = serializer.instance
        self._check_editable(role)
        if role.client_id is None and role.name == DEFAULT_ROLE_NAME and serializer.validated_data.get("name", role.name) != role.name:
            raise ValidationError({"name": "The built-in Default role can't be renamed."})
        serializer.save(updated_by=self.request.user)

    def perform_destroy(self, instance):
        self._check_editable(instance)
        if instance.client_id is None and instance.name == DEFAULT_ROLE_NAME:
            raise ValidationError({"detail": "The built-in Default role can't be deleted."})
        in_use = instance.assignments.count()
        if in_use:
            raise ValidationError({"detail": f"This role is used by {in_use} assignment(s). Move them to another role first."})
        instance.delete()


@api_view(["GET"])
def permission_catalog(request):
    """The permissions a role can include, with English labels (the app translates them)."""
    return Response([{"code": code, "label": label} for code, label in Permission.choices])
