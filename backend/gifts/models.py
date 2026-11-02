from django.conf import settings
from django.db import models
from django.db.models import Q

from events.models import Event, Guest


class Gift(models.Model):
    class Method(models.TextChoices):
        CASH = "cash", "Cash"
        TRANSFER = "transfer", "Bank transfer"
        OTHER = "other", "Other"
        # A non-money gift (e.g. a watch): described by `item`, with no amount, so money totals
        # (SUM ignores NULL) stay real money only.
        ITEM = "item", "Item"

    # Generated on the client when the gift is recorded; the idempotency key.
    client_txn_id = models.UUIDField(unique=True)
    event = models.ForeignKey(Event, on_delete=models.PROTECT, related_name="gifts")
    guest = models.ForeignKey(
        Guest, on_delete=models.PROTECT, null=True, blank=True, related_name="gifts"
    )
    walk_in_name = models.CharField(max_length=200, blank=True)
    amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    currency = models.CharField(max_length=3)
    method = models.CharField(max_length=16, choices=Method.choices, default=Method.CASH)
    item = models.CharField(max_length=200, blank=True)
    note = models.CharField(max_length=500, blank=True)
    client_created_at = models.DateTimeField()
    device_id = models.CharField(max_length=64, blank=True)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="recorded_gifts"
    )
    received_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    voided = models.BooleanField(default=False)

    class Meta:
        ordering = ["-client_created_at"]
        constraints = [
            # Money gifts have a positive amount and no item; item gifts have a description and no amount.
            models.CheckConstraint(
                condition=(Q(method="item") & Q(amount__isnull=True) & ~Q(item=""))
                | (~Q(method="item") & Q(amount__gt=0) & Q(item="")),
                name="gift_amount_or_item",
            ),
            models.CheckConstraint(
                condition=Q(guest__isnull=False) | ~Q(walk_in_name=""),
                name="gift_has_guest_or_walk_in",
            ),
        ]

    def __str__(self):
        who = self.guest.full_name if self.guest_id else self.walk_in_name
        return f"{who}: {self.item}" if self.method == self.Method.ITEM else f"{who}: {self.amount} {self.currency}"
