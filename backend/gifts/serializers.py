from datetime import timedelta
from decimal import Decimal

from django.utils import timezone
from rest_framework import serializers

from events.models import Guest

from .models import Gift

MAX_AMOUNT = Decimal("9999999999.99")


def amount_or_item_errors(method, amount, item):
    """Item gifts need a description and no amount; money gifts need a positive amount and no item."""
    if method == Gift.Method.ITEM:
        if amount is not None:
            return {"amount": ["An item gift has no amount."]}
        if not item:
            return {"item": ["Describe the item (e.g. Watch)."]}
    else:
        if amount is None:
            return {"amount": ["Enter an amount."]}
        if amount <= 0:
            return {"amount": ["Amount must be greater than zero."]}
        if item:
            return {"item": ["Only item gifts have an item description."]}
    return None


class GiftSyncItemSerializer(serializers.Serializer):
    """Shape/format validation for one offline transaction.

    Cross-record rules (membership, guest ownership, idempotency) live in
    `gifts.services.sync` because they need the database and the user.
    """

    client_txn_id = serializers.UUIDField()
    event_id = serializers.IntegerField(min_value=1)
    guest_id = serializers.IntegerField(min_value=1, required=False, allow_null=True)
    walk_in_name = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")
    amount = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=Decimal("0.01"), max_value=MAX_AMOUNT, required=False, allow_null=True
    )
    currency = serializers.CharField(max_length=3, min_length=3, required=False)
    method = serializers.ChoiceField(choices=Gift.Method.choices, default=Gift.Method.CASH)
    item = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")
    note = serializers.CharField(max_length=500, required=False, allow_blank=True, default="")
    client_created_at = serializers.DateTimeField()
    device_id = serializers.CharField(max_length=64, required=False, allow_blank=True, default="")

    def validate_client_created_at(self, value):
        if value > timezone.now() + timedelta(days=1):
            raise serializers.ValidationError("Timestamp is in the future.")
        return value

    def validate(self, attrs):
        attrs["walk_in_name"] = attrs.get("walk_in_name", "").strip()
        if not attrs.get("guest_id") and not attrs["walk_in_name"]:
            raise serializers.ValidationError({"guest_id": "Select a guest or enter a walk-in name."})
        attrs["item"] = attrs.get("item", "").strip()
        attrs.setdefault("amount", None)
        errors = amount_or_item_errors(attrs["method"], attrs["amount"], attrs["item"])
        if errors:
            raise serializers.ValidationError(errors)
        if attrs.get("currency"):
            attrs["currency"] = attrs["currency"].upper()
        return attrs


class GiftSerializer(serializers.ModelSerializer):
    guest_name = serializers.SerializerMethodField()
    recorded_by_username = serializers.CharField(source="recorded_by.username", read_only=True)

    class Meta:
        model = Gift
        fields = [
            "id",
            "client_txn_id",
            "event",
            "guest",
            "guest_name",
            "walk_in_name",
            "amount",
            "currency",
            "method",
            "item",
            "note",
            "client_created_at",
            "device_id",
            "recorded_by",
            "recorded_by_username",
            "received_at",
            "updated_at",
            "voided",
        ]
        read_only_fields = [
            "id",
            "client_txn_id",
            "event",
            "currency",
            "client_created_at",
            "device_id",
            "recorded_by",
            "recorded_by_username",
            "received_at",
            "updated_at",
            "voided",
        ]

    def get_guest_name(self, obj):
        return obj.guest.full_name if obj.guest_id else obj.walk_in_name

    def validate_guest(self, guest: Guest | None):
        if guest is not None and (guest.event_id != self.instance.event_id or guest.is_deleted):
            raise serializers.ValidationError("Guest does not belong to this event.")
        return guest

    def validate(self, attrs):
        guest = attrs.get("guest", self.instance.guest if self.instance else None)
        walk_in = attrs.get("walk_in_name", self.instance.walk_in_name if self.instance else "")
        if guest is None and not (walk_in or "").strip():
            raise serializers.ValidationError({"guest": "Select a guest or enter a walk-in name."})
        # Check amount/item against the gift as it will be after this edit (method may change too).
        current = self.instance
        method = attrs.get("method", current.method if current else Gift.Method.CASH)
        amount = attrs.get("amount", current.amount if current else None)
        item = attrs.get("item", current.item if current else "").strip()
        if method == Gift.Method.ITEM:
            amount = attrs["amount"] = None  # switching to an item drops the old amount
        elif "item" not in attrs:
            item = attrs["item"] = ""  # switching back to money drops the old description
        attrs["item"] = item
        errors = amount_or_item_errors(method, amount, item)
        if errors:
            raise serializers.ValidationError(errors)
        return attrs
