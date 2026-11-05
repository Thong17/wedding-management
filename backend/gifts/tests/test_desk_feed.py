import uuid

from django.urls import reverse
from rest_framework.test import APITestCase

from events.models import Event, Guest, Permission
from events.tests.factories import assign, make_client, make_client_admin, make_user
from gifts.models import Gift


class GiftDeskFeedTests(APITestCase):
    """Every desk on an event sees which guests already have gifts and the latest gifts, whoever recorded them."""

    def setUp(self):
        self.org = make_client()
        self.owner = make_client_admin("owner", self.org)
        self.event = Event.objects.create(name="W", date="2026-10-24", currency="USD", created_by=self.owner, client=self.org)
        self.sokha = Guest.objects.create(event=self.event, full_name="Sokha")
        self.dara = Guest.objects.create(event=self.event, full_name="Dara")
        self.url = reverse("desk-feed", args=[self.event.pk])

    def gift(self, guest, **fields):
        fields.setdefault("client_created_at", "2026-10-24T10:00:00Z")
        return Gift.objects.create(
            event=self.event, guest=guest, client_txn_id=uuid.uuid4(), amount="10.00", currency="USD", method="cash",
            recorded_by=self.owner, **fields,
        )

    def test_counts_gifts_per_guest_leaving_out_voided_and_walk_ins(self):
        self.gift(self.sokha)
        self.gift(self.sokha)
        self.gift(self.dara, voided=True)
        self.gift(None, walk_in_name="Uncle")
        self.client.force_authenticate(self.owner)
        res = self.client.get(self.url)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["marks"], [{"guest": self.sokha.pk, "count": 2}])
        # Totals cover walk-ins too, but not voided gifts.
        self.assertEqual(res.data["totals"], {"count": 3, "total": "30.00"})

    def test_a_desk_allowed_to_see_all_gifts_gets_every_desk_s_recent_gifts_but_not_the_total(self):
        desk = make_user("desk", client=self.org)
        assign(desk, self.event, permissions=[Permission.GIFT_DESK, Permission.GIFT_VIEW_ALL])
        self.gift(self.dara)
        self.client.force_authenticate(desk)
        data = self.client.get(self.url).data
        self.assertEqual(data["marks"], [{"guest": self.dara.pk, "count": 1}])
        self.assertEqual([(g["guest_name"], g["recorded_by_username"]) for g in data["recent"]], [("Dara", "owner")])
        self.assertIsNone(data["totals"])
        # Correcting gifts still needs the edit permissions: the server's gift list stays closed to this login.
        self.assertEqual(self.client.get(f"/api/events/{self.event.pk}/gifts/").status_code, 403)

    def test_a_desk_allowed_to_view_the_total_gets_it_without_other_desks_gifts(self):
        desk = make_user("desk", client=self.org)
        assign(desk, self.event, permissions=[Permission.GIFT_DESK, Permission.GIFT_VIEW_TOTAL])
        self.gift(self.dara)
        self.client.force_authenticate(desk)
        data = self.client.get(self.url).data
        self.assertEqual(data["totals"], {"count": 1, "total": "10.00"})
        self.assertEqual(data["recent"], [])

    def test_a_desk_without_it_sees_only_which_guests_are_marked(self):
        desk = make_user("desk", client=self.org)
        assign(desk, self.event, permissions=[Permission.GIFT_DESK])
        self.gift(self.dara)
        self.client.force_authenticate(desk)
        data = self.client.get(self.url).data
        self.assertEqual(data, {"marks": [{"guest": self.dara.pk, "count": 1}], "totals": None, "recent": []})
        self.assertEqual(self.client.get(reverse("desk-gifts", args=[self.event.pk])).status_code, 403)

    def test_recent_is_newest_first_limited_and_flags_voided(self):
        for minute in range(35):
            self.gift(self.sokha, client_created_at=f"2026-10-24T10:{minute:02d}:00Z")
        self.gift(self.dara, voided=True, client_created_at="2026-10-24T11:00:00Z")
        self.client.force_authenticate(self.owner)
        recent = self.client.get(self.url).data["recent"]
        self.assertEqual(len(recent), 30)
        self.assertEqual((recent[0]["guest_name"], recent[0]["voided"]), ("Dara", True))
        self.assertEqual(recent[1]["client_created_at"][:16], "2026-10-24T10:34")

    def test_the_desk_s_all_gifts_list_has_every_gift_voided_ones_flagged(self):
        for minute in range(35):
            self.gift(self.sokha, client_created_at=f"2026-10-24T10:{minute:02d}:00Z")
        self.gift(self.dara, voided=True, client_created_at="2026-10-24T11:00:00Z")
        desk = make_user("desk", client=self.org)
        assign(desk, self.event, permissions=[Permission.GIFT_DESK, Permission.GIFT_VIEW_ALL])
        self.client.force_authenticate(desk)
        res = self.client.get(reverse("desk-gifts", args=[self.event.pk]))
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data), 36)
        self.assertEqual((res.data[0]["guest_name"], res.data[0]["voided"]), ("Dara", True))

    def test_people_without_access_to_the_event_get_nothing(self):
        outsider = make_user("outsider", client=self.org)
        self.client.force_authenticate(outsider)
        self.assertIn(self.client.get(self.url).status_code, (403, 404))
        self.assertIn(self.client.get(reverse("desk-gifts", args=[self.event.pk])).status_code, (403, 404))
