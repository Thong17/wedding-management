import uuid

from django.conf import settings
from django.db import models


class Event(models.Model):
    name = models.CharField(max_length=200)
    date = models.DateField()
    venue = models.CharField(max_length=255, blank=True)
    currency = models.CharField(max_length=3, default="USD")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="created_events"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-date", "name"]

    def __str__(self):
        return f"{self.name} ({self.date})"


class EventMembership(models.Model):
    class Role(models.TextChoices):
        OWNER = "owner", "Owner"
        MANAGER = "manager", "Manager"

    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="memberships")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="event_memberships"
    )
    role = models.CharField(max_length=16, choices=Role.choices, default=Role.MANAGER)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["event", "user"], name="uniq_event_member"),
        ]

    def __str__(self):
        return f"{self.user} @ {self.event} ({self.role})"


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
