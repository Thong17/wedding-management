"""Idempotent ingestion of offline gift transactions.

Every item in a batch is processed independently inside its own savepoint, so
one invalid transaction never prevents the others from being stored. The
client-generated `client_txn_id` is the idempotency key: re-sending a
transaction that is already stored returns `duplicate`, which the client treats
as success.
"""

import uuid
from dataclasses import dataclass, field
from typing import Any

from django.db import IntegrityError, transaction

from events import access
from events.models import Event, Guest, Permission

from ..models import Gift
from ..serializers import GiftSyncItemSerializer

CREATED = "created"
DUPLICATE = "duplicate"
REJECTED = "rejected"


@dataclass
class ItemResult:
    client_txn_id: str | None
    status: str
    gift_id: int | None = None
    code: str | None = None
    errors: dict[str, Any] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        data: dict[str, Any] = {"client_txn_id": self.client_txn_id, "status": self.status}
        if self.gift_id is not None:
            data["gift_id"] = self.gift_id
        if self.code:
            data["code"] = self.code
        if self.errors:
            data["errors"] = self.errors
        return data


def _raw_txn_id(raw: Any) -> str | None:
    if not isinstance(raw, dict):
        return None
    value = raw.get("client_txn_id")
    try:
        return str(uuid.UUID(str(value)))
    except (TypeError, ValueError, AttributeError):
        return None if value is None else str(value)


def _same_transaction(existing: Gift, data: dict, user) -> bool:
    """Whether an existing row is the same logical transaction as `data`.

    Only fields that never change after creation are compared, so a gift that
    was later corrected online is still recognised as a duplicate re-send.
    """
    return (
        existing.event_id == data["event_id"]
        and existing.recorded_by_id == user.id
        and existing.client_created_at == data["client_created_at"]
    )


def _existing_result(existing: Gift, data: dict, user, txn_id: str) -> ItemResult:
    if _same_transaction(existing, data, user):
        return ItemResult(txn_id, DUPLICATE, gift_id=existing.pk)
    return ItemResult(
        txn_id,
        REJECTED,
        code="id_conflict",
        errors={"client_txn_id": ["This transaction ID is already used by a different gift."]},
    )


def process_item(user, raw: Any, member_event_ids: set[int]) -> ItemResult:
    txn_id = _raw_txn_id(raw)
    ser = GiftSyncItemSerializer(data=raw if isinstance(raw, dict) else {})
    if not ser.is_valid():
        return ItemResult(txn_id, REJECTED, code="validation", errors=ser.errors)
    data = ser.validated_data
    txn_id = str(data["client_txn_id"])

    if data["event_id"] not in member_event_ids:
        return ItemResult(
            txn_id, REJECTED, code="forbidden", errors={"event_id": ["Your role on this event doesn't allow recording gifts."]}
        )

    existing = Gift.objects.filter(client_txn_id=data["client_txn_id"]).first()
    if existing:
        return _existing_result(existing, data, user, txn_id)

    guest = None
    if data.get("guest_id"):
        guest = Guest.objects.filter(pk=data["guest_id"], event_id=data["event_id"]).select_related("event").first()
        if guest is None:
            return ItemResult(
                txn_id, REJECTED, code="guest_not_found", errors={"guest_id": ["Guest not found in this event."]}
            )
        # A gift recorded before the guest was removed is still legitimate.
        if guest.is_deleted and guest.deleted_at and data["client_created_at"] > guest.deleted_at:
            return ItemResult(
                txn_id, REJECTED, code="guest_deleted", errors={"guest_id": ["Guest was removed from this event."]}
            )
        event_currency = guest.event.currency
    else:
        event_currency = Event.objects.values_list("currency", flat=True).get(pk=data["event_id"])

    currency = data.get("currency") or event_currency
    if currency != event_currency:
        return ItemResult(
            txn_id,
            REJECTED,
            code="validation",
            errors={"currency": [f"Event currency is {event_currency}."]},
        )

    try:
        with transaction.atomic():
            gift = Gift.objects.create(
                client_txn_id=data["client_txn_id"],
                event_id=data["event_id"],
                guest=guest,
                walk_in_name="" if guest else data["walk_in_name"],
                amount=data["amount"],
                currency=currency,
                method=data["method"],
                item=data["item"],
                note=data.get("note", ""),
                client_created_at=data["client_created_at"],
                device_id=data.get("device_id", ""),
                recorded_by=user,
            )
    except IntegrityError:
        # Lost a race with a concurrent request carrying the same transaction ID.
        existing = Gift.objects.filter(client_txn_id=data["client_txn_id"]).first()
        if existing is None:
            raise
        return _existing_result(existing, data, user, txn_id)
    return ItemResult(txn_id, CREATED, gift_id=gift.pk)


def sync_transactions(user, items: list[Any]) -> list[dict[str, Any]]:
    member_event_ids = access.event_ids_with(user, Permission.GIFT_DESK)
    return [process_item(user, raw, member_event_ids).as_dict() for raw in items]
