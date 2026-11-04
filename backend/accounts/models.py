import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone

from .storage import private_storage


def avatar_path(instance, filename):
    # A fresh name on every upload, so browsers and the offline cache never show a stale picture.
    ext = filename.rsplit(".", 1)[-1].lower()
    return f"avatars/{instance.user_id}-{uuid.uuid4().hex[:12]}.{ext}"


class Client(models.Model):
    """A business customer (e.g. a wedding planner or banquet hall) that offers the gift desk to its customers."""

    class Status(models.TextChoices):
        TRIAL = "trial", "Trial"
        ACTIVE = "active", "Active"
        SUSPENDED = "suspended", "Suspended"

    class BillingPeriod(models.TextChoices):
        MONTHLY = "monthly", "Monthly"
        YEARLY = "yearly", "Yearly"
        PER_EVENT = "per_event", "Per event"

    business_name = models.CharField(max_length=200)
    contact_name = models.CharField(max_length=200, blank=True)
    phone = models.CharField(max_length=32, blank=True)
    email = models.EmailField(blank=True)
    address = models.TextField(blank=True)

    status = models.CharField(max_length=16, choices=Status.choices, default=Status.TRIAL)
    # Last day of the trial (inclusive). Blank means no end date.
    trial_ends_at = models.DateField(null=True, blank=True)
    subscription_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    subscription_currency = models.CharField(max_length=3, default="USD")
    billing_period = models.CharField(max_length=16, choices=BillingPeriod.choices, blank=True)
    subscription_start = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["business_name"]

    def __str__(self):
        return self.business_name

    def lock_reason(self, today=None):
        """Why this client's logins are locked ('suspended' / 'trial_ended'), or None. Computed, so expiry needs no job."""
        if self.status == self.Status.SUSPENDED:
            return "suspended"
        today = today or timezone.localdate()
        if self.status == self.Status.TRIAL and self.trial_ends_at and today > self.trial_ends_at:
            return "trial_ended"
        return None


# Client documents (ID cards, licences, contracts) are sensitive: they live in the "private" storage
# (outside MEDIA_ROOT, or a private bucket prefix), have no public URL, and are only ever sent through
# an authenticated download endpoint.


def document_path(instance, filename):
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "bin"
    return f"client-documents/{instance.client_id}/{uuid.uuid4().hex}.{ext}"


class ClientDocument(models.Model):
    class Type(models.TextChoices):
        BUSINESS_LICENSE = "business_license", "Business license"
        ID_CARD = "id_card", "ID card"
        CONTRACT = "contract", "Contract"
        OTHER = "other", "Other"

    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name="documents")
    doc_type = models.CharField(max_length=32, choices=Type.choices, default=Type.OTHER)
    number = models.CharField(max_length=100, blank=True)
    issued_on = models.DateField(null=True, blank=True)
    expires_on = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True)
    file = models.FileField(storage=private_storage, upload_to=document_path)
    original_name = models.CharField(max_length=255, blank=True)
    content_type = models.CharField(max_length=100, blank=True)
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+")
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-uploaded_at"]

    def __str__(self):
        return f"{self.get_doc_type_display()} for {self.client}"


class Profile(models.Model):
    """Per-user extras that Django's built-in User has no field for."""

    class UserType(models.TextChoices):
        PLATFORM_ADMIN = "platform_admin", "Platform admin"
        CLIENT_ADMIN = "client_admin", "Client admin"
        CUSTOMER = "customer", "Customer"

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="profile")
    avatar = models.FileField(upload_to=avatar_path, blank=True)
    user_type = models.CharField(max_length=16, choices=UserType.choices, default=UserType.CUSTOMER)
    # Client admins always have a client; customers may be standalone (no client, managed by the platform admin).
    client = models.ForeignKey(Client, on_delete=models.PROTECT, null=True, blank=True, related_name="profiles")
    # Own access end date (inclusive) — only used for standalone customers. Blank means no end date.
    trial_ends_at = models.DateField(null=True, blank=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=~models.Q(user_type="client_admin") | models.Q(client__isnull=False),
                name="client_admin_has_client",
            ),
        ]

    def __str__(self):
        return f"Profile of {self.user}"
