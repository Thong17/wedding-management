import uuid
from datetime import timedelta
from decimal import Decimal
from unittest import mock

from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import AccessToken

from events.models import Event, EventMembership, Guest
from gifts.models import Gift

User = get_user_model()


def make_txn(event, guest=None, **overrides):
    data = {
        "client_txn_id": str(uuid.uuid4()),
        "event_id": event.pk,
        "guest_id": guest.pk if guest else None,
        "amount": "50.00",
        "currency": event.currency,
        "method": "cash",
        "note": "",
        "client_created_at": timezone.now().isoformat(),
        "device_id": "test-device",
    }
    data.update(overrides)
    return data


class SyncTestBase(APITestCase):
    url = reverse("gift-sync")

    def setUp(self):
        self.user = User.objects.create_user("manager", password="pw-123456")
        self.event = Event.objects.create(name="W", date="2026-10-24", currency="USD", created_by=self.user)
        EventMembership.objects.create(event=self.event, user=self.user, role="owner")
        self.guest = Guest.objects.create(event=self.event, full_name="Sokha Chan")
        self.client.force_authenticate(self.user)

    def sync(self, *txns):
        return self.client.post(self.url, {"transactions": list(txns)}, format="json")


class GiftSyncTests(SyncTestBase):
    def test_creates_gifts(self):
        t1 = make_txn(self.event, self.guest)
        t2 = make_txn(self.event, walk_in_name="Walk-in Uncle", guest_id=None, amount="20")
        res = self.sync(t1, t2)
        self.assertEqual(res.status_code, 200)
        statuses = [r["status"] for r in res.data["results"]]
        self.assertEqual(statuses, ["created", "created"])
        self.assertEqual(Gift.objects.count(), 2)
        gift = Gift.objects.get(client_txn_id=t1["client_txn_id"])
        self.assertEqual(gift.recorded_by, self.user)
        self.assertEqual(str(gift.amount), "50.00")

    def test_resending_same_batch_is_idempotent(self):
        t1 = make_txn(self.event, self.guest)
        first = self.sync(t1).data["results"][0]
        second = self.sync(t1).data["results"][0]
        self.assertEqual(first["status"], "created")
        self.assertEqual(second["status"], "duplicate")
        self.assertEqual(second["gift_id"], first["gift_id"])
        self.assertEqual(Gift.objects.count(), 1)

    def test_duplicate_within_one_batch(self):
        t1 = make_txn(self.event, self.guest)
        results = self.sync(t1, dict(t1)).data["results"]
        self.assertEqual([r["status"] for r in results], ["created", "duplicate"])
        self.assertEqual(Gift.objects.count(), 1)

    def test_duplicate_still_recognised_after_online_edit(self):
        t1 = make_txn(self.event, self.guest)
        self.sync(t1)
        Gift.objects.update(amount="75.00")
        self.assertEqual(self.sync(t1).data["results"][0]["status"], "duplicate")

    def test_reused_id_with_different_identity_is_conflict(self):
        other_event = Event.objects.create(name="W2", date="2026-10-25", currency="USD", created_by=self.user)
        EventMembership.objects.create(event=other_event, user=self.user)
        t1 = make_txn(self.event, self.guest)
        self.sync(t1)
        clash = make_txn(other_event, walk_in_name="X", guest_id=None, client_txn_id=t1["client_txn_id"])
        result = self.sync(clash).data["results"][0]
        self.assertEqual(result["status"], "rejected")
        self.assertEqual(result["code"], "id_conflict")
        self.assertEqual(Gift.objects.count(), 1)

    def test_partial_failure_keeps_valid_items(self):
        good = make_txn(self.event, self.guest)
        bad_amount = make_txn(self.event, self.guest, amount="-5")
        no_guest = make_txn(self.event, guest_id=None, walk_in_name="")
        not_a_dict = "garbage"
        results = self.sync(good, bad_amount, no_guest, not_a_dict).data["results"]
        self.assertEqual([r["status"] for r in results], ["created", "rejected", "rejected", "rejected"])
        self.assertEqual(results[1]["code"], "validation")
        self.assertIn("amount", results[1]["errors"])
        self.assertEqual(results[1]["client_txn_id"], bad_amount["client_txn_id"])
        self.assertEqual(Gift.objects.count(), 1)

    def test_guest_from_other_event_rejected(self):
        other_event = Event.objects.create(name="W2", date="2026-10-25", created_by=self.user)
        other_guest = Guest.objects.create(event=other_event, full_name="Stranger")
        result = self.sync(make_txn(self.event, other_guest)).data["results"][0]
        self.assertEqual(result["code"], "guest_not_found")

    def test_non_member_rejected(self):
        outsider_event = Event.objects.create(name="Other", date="2026-10-25", created_by=self.user)
        result = self.sync(make_txn(outsider_event, walk_in_name="A", guest_id=None)).data["results"][0]
        self.assertEqual(result["code"], "forbidden")
        self.assertEqual(Gift.objects.count(), 0)

    def test_currency_must_match_event(self):
        result = self.sync(make_txn(self.event, self.guest, currency="KHR")).data["results"][0]
        self.assertEqual(result["status"], "rejected")
        self.assertIn("currency", result["errors"])

    def test_future_timestamp_rejected(self):
        future = (timezone.now() + timedelta(days=3)).isoformat()
        result = self.sync(make_txn(self.event, self.guest, client_created_at=future)).data["results"][0]
        self.assertEqual(result["code"], "validation")

    def test_deleted_guest_accepted_only_for_gifts_recorded_before_deletion(self):
        recorded_before = (timezone.now() - timedelta(minutes=10)).isoformat()
        self.guest.is_deleted = True
        self.guest.deleted_at = timezone.now() - timedelta(minutes=5)
        self.guest.save()
        before = self.sync(make_txn(self.event, self.guest, client_created_at=recorded_before)).data["results"][0]
        after = self.sync(make_txn(self.event, self.guest)).data["results"][0]
        self.assertEqual(before["status"], "created")
        self.assertEqual(after["code"], "guest_deleted")

    def test_concurrent_insert_race_returns_duplicate(self):
        t1 = make_txn(self.event, self.guest)
        self.sync(t1)
        real_filter = Gift.objects.filter
        calls = {"n": 0}

        def filter_hiding_first_lookup(*args, **kwargs):
            # Simulate the row not being visible yet on the first idempotency check.
            calls["n"] += 1
            qs = real_filter(*args, **kwargs)
            return qs.none() if calls["n"] == 1 else qs

        with mock.patch.object(Gift.objects, "filter", side_effect=filter_hiding_first_lookup):
            result = self.sync(t1).data["results"][0]
        self.assertEqual(result["status"], "duplicate")
        self.assertEqual(Gift.objects.count(), 1)

    def test_bad_envelope_is_400(self):
        self.assertEqual(self.client.post(self.url, {"transactions": []}, format="json").status_code, 400)
        self.assertEqual(self.client.post(self.url, {"foo": 1}, format="json").status_code, 400)

    @override_settings(GIFT_SYNC_MAX_BATCH=2)
    def test_batch_too_large_is_413(self):
        txns = [make_txn(self.event, self.guest) for _ in range(3)]
        self.assertEqual(self.sync(*txns).status_code, 413)
        self.assertEqual(Gift.objects.count(), 0)


class SyncAuthTests(SyncTestBase):
    def test_missing_token_is_401(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.sync(make_txn(self.event, self.guest)).status_code, 401)

    def test_expired_token_is_401(self):
        self.client.force_authenticate(None)
        token = AccessToken.for_user(self.user)
        token.set_exp(lifetime=-timedelta(minutes=1))
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        self.assertEqual(self.sync(make_txn(self.event, self.guest)).status_code, 401)
        self.assertEqual(Gift.objects.count(), 0)

    def test_valid_jwt_works(self):
        self.client.force_authenticate(None)
        res = self.client.post(
            reverse("token_obtain_pair"), {"username": "manager", "password": "pw-123456"}, format="json"
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {res.data['access']}")
        self.assertEqual(self.sync(make_txn(self.event, self.guest)).data["results"][0]["status"], "created")


class GiftEditTests(SyncTestBase):
    def setUp(self):
        super().setUp()
        self.sync(make_txn(self.event, self.guest))
        self.gift = Gift.objects.get()
        self.url_detail = f"/api/events/{self.event.pk}/gifts/{self.gift.pk}/"

    def test_list_gifts(self):
        res = self.client.get(f"/api/events/{self.event.pk}/gifts/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data[0]["guest_name"], "Sokha Chan")

    def test_patch_with_current_version(self):
        res = self.client.patch(
            self.url_detail, {"amount": "80.00", "updated_at": self.gift.updated_at.isoformat()}, format="json"
        )
        self.assertEqual(res.status_code, 200, res.data)
        self.gift.refresh_from_db()
        self.assertEqual(str(self.gift.amount), "80.00")

    def test_stale_patch_is_409(self):
        stale = self.gift.updated_at.isoformat()
        self.client.patch(self.url_detail, {"amount": "60.00", "updated_at": stale}, format="json")
        res = self.client.patch(self.url_detail, {"amount": "90.00", "updated_at": stale}, format="json")
        self.assertEqual(res.status_code, 409)
        self.gift.refresh_from_db()
        self.assertEqual(str(self.gift.amount), "60.00")

    def test_patch_without_version_is_400(self):
        self.assertEqual(self.client.patch(self.url_detail, {"amount": "1"}, format="json").status_code, 400)

    def test_void(self):
        res = self.client.post(f"{self.url_detail}void/", {"updated_at": self.gift.updated_at.isoformat()}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data["voided"])
        self.assertEqual(self.client.get(f"/api/events/{self.event.pk}/gifts/").data, [])


class ItemGiftTests(SyncTestBase):
    """Non-money gifts (e.g. a watch): described, never given an amount, kept out of money totals."""

    def item_txn(self, **overrides):
        return make_txn(self.event, self.guest, **{"method": "item", "amount": None, "item": "  Gold watch ", **overrides})

    def test_syncs_an_item_without_amount(self):
        res = self.sync(self.item_txn())
        self.assertEqual(res.data["results"][0]["status"], "created", res.data)
        gift = Gift.objects.get()
        self.assertEqual((gift.method, gift.item, gift.amount), ("item", "Gold watch", None))

    def test_item_rules(self):
        cases = [
            self.item_txn(item=""),  # item needs a description
            self.item_txn(amount="10.00"),  # item can't have an amount
            make_txn(self.event, self.guest, amount=None),  # money needs an amount
            make_txn(self.event, self.guest, amount="0"),  # ...greater than zero
            make_txn(self.event, self.guest, item="Watch"),  # money gifts have no item text
        ]
        results = self.sync(*cases).data["results"]
        self.assertEqual([r["status"] for r in results], ["rejected"] * len(cases))
        self.assertEqual(Gift.objects.count(), 0)

    def test_database_enforces_item_rules(self):
        base = dict(event=self.event, guest=self.guest, currency="USD", client_created_at=timezone.now(), recorded_by=self.user)
        with self.assertRaises(IntegrityError):
            Gift.objects.create(client_txn_id=uuid.uuid4(), method="item", amount=None, item="", **base)

    def test_report_keeps_items_out_of_money_totals(self):
        self.sync(make_txn(self.event, self.guest, amount="50.00"), self.item_txn())
        self.sync(make_txn(self.event, None, method="item", amount=None, item="Rice cooker", walk_in_name="Uncle Bo"))
        report = self.client.get(f"/api/events/{self.event.pk}/report/").data
        self.assertEqual((report["count"], Decimal(report["total"])), (3, Decimal("50")))
        self.assertEqual(
            report["items"],
            [
                {"guest_id": self.guest.pk, "name": "Sokha Chan", "item": "Gold watch"},
                {"guest_id": None, "name": "Uncle Bo", "item": "Rice cooker"},
            ],
        )
        row = next(g for g in report["by_guest"] if g["id"] == self.guest.pk)
        self.assertEqual((row["gift_count"], Decimal(row["gift_total"])), (2, Decimal("50")))

    def test_edit_between_money_and_item(self):
        self.sync(make_txn(self.event, self.guest, amount="30.00"))
        gift = Gift.objects.get()
        url = f"/api/events/{self.event.pk}/gifts/{gift.pk}/"
        res = self.client.patch(url, {"method": "item", "item": "Watch", "updated_at": gift.updated_at.isoformat()}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual((res.data["amount"], res.data["item"]), (None, "Watch"))
        gift.refresh_from_db()
        res = self.client.patch(url, {"method": "cash", "updated_at": gift.updated_at.isoformat()}, format="json")
        self.assertEqual(res.status_code, 400)  # back to money needs an amount
        res = self.client.patch(url, {"method": "cash", "amount": "25", "updated_at": gift.updated_at.isoformat()}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual((res.data["amount"], res.data["item"]), ("25.00", ""))
