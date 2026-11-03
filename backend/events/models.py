import uuid

from django.conf import settings
from django.db import models


class Event(models.Model):
    name = models.CharField(max_length=200)
    date = models.DateField()
    venue = models.CharField(max_length=255, blank=True)
    currency = models.CharField(max_length=3, default="USD")
    # Invitation QR base: a web link (e.g. Google Maps) or a bank KHQR string. Each guest's QR is this
    # with the guest's code embedded (see frontend/src/offline/inviteQr.ts). Blank = plain guest QR.
    invite_qr = models.CharField(max_length=1000, blank=True)
    # The client (business) that owns the event; null for events the platform admin runs directly.
    client = models.ForeignKey("accounts.Client", on_delete=models.PROTECT, null=True, blank=True, related_name="events")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="created_events"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-date", "name"]

    def __str__(self):
        return f"{self.name} ({self.date})"


class Permission(models.TextChoices):
    """What a role can allow on an event. Client admins and the platform admin always have all of them."""

    GIFT_DESK = "gift_desk", "Gift desk"
    GIFT_EDIT = "gift_edit", "Edit & void gifts"
    GUEST_ADD = "guest_add", "Add guests"
    GUEST_EDIT = "guest_edit", "Edit guests"
    GUEST_DELETE = "guest_delete", "Delete guests"
    GUEST_IMPORT = "guest_import", "Import guests"
    GUEST_EXPORT = "guest_export", "Export guests"
    REPORT_VIEW = "report_view", "View report"


DEFAULT_ROLE_NAME = "Default"
DEFAULT_ROLE_PERMISSIONS = ["gift_desk", "guest_add", "guest_edit", "guest_delete", "guest_import"]


class Role(models.Model):
    """A named set of permissions given to a customer on an event. Global (client=None) or one client's own."""

    name = models.CharField(max_length=100)
    client = models.ForeignKey("accounts.Client", on_delete=models.CASCADE, null=True, blank=True, related_name="roles")
    permissions = models.JSONField(default=list)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")

    class Meta:
        ordering = ["client_id", "name"]
        constraints = [
            models.UniqueConstraint(fields=["client", "name"], name="uniq_role_name_per_client"),
            # NULL client values aren't equal to each other in SQL, so global names need their own rule.
            models.UniqueConstraint(fields=["name"], condition=models.Q(client__isnull=True), name="uniq_global_role_name"),
        ]

    def __str__(self):
        return f"{self.name} ({self.client or 'global'})"


class EventAssignment(models.Model):
    """A customer assigned to an event with a role. The only way a customer sees an event."""

    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="assignments")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="event_assignments")
    # PROTECT: a role in use can't be deleted until its people are moved to another role.
    role = models.ForeignKey(Role, on_delete=models.PROTECT, related_name="assignments")
    assigned_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["event", "user"], name="uniq_event_assignment")]

    def __str__(self):
        return f"{self.user} @ {self.event} as {self.role.name}"


class Guest(models.Model):
    class Side(models.TextChoices):
        BRIDE = "bride", "Bride"
        GROOM = "groom", "Groom"
        BOTH = "both", "Both"

    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="guests")
    full_name = models.CharField(max_length=200)
    nickname = models.CharField(max_length=100, blank=True)
    phone = models.CharField(max_length=32, blank=True)
    side = models.CharField(max_length=8, choices=Side.choices, default=Side.BOTH)
    group = models.CharField(max_length=100, blank=True)
    table_no = models.CharField(max_length=20, blank=True)
    qr_token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    is_deleted = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True, db_index=True)

    class Meta:
        ordering = ["full_name"]
        indexes = [models.Index(fields=["event", "updated_at"])]

    def __str__(self):
        return self.full_name
