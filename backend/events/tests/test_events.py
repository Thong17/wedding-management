import time

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APITestCase

from events.models import Event, EventMembership, Guest
from gifts.models import Gift

User = get_user_model()


class EventTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user("owner", password="pw-123456")
        self.manager = User.objects.create_user("helper", password="pw-123456")
        self.outsider = User.objects.create_user("outsider", password="pw-123456")
        self.client.force_authenticate(self.owner)

    def create_event(self):
        res = self.client.post("/api/events/", {"name": "Wedding", "date": "2026-11-01", "currency": "usd"}, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        return res.data

    def test_create_makes_owner_membership(self):
        data = self.create_event()
        self.assertEqual(data["role"], "owner")
        self.assertEqual(data["currency"], "USD")
        self.assertTrue(EventMembership.objects.filter(event_id=data["id"], user=self.owner, role="owner").exists())

    def test_outsider_cannot_see_event(self):
        data = self.create_event()
        self.client.force_authenticate(self.outsider)
        self.assertEqual(self.client.get("/api/events/").data, [])
        self.assertEqual(self.client.get(f"/api/events/{data['id']}/").status_code, 404)
        self.assertEqual(self.client.get(f"/api/events/{data['id']}/guests/").status_code, 403)

    def test_manager_can_read_but_not_edit_event(self):
        data = self.create_event()
        self.client.post(f"/api/events/{data['id']}/members/", {"username": "helper"}, format="json")
        self.client.force_authenticate(self.manager)
        self.assertEqual(self.client.get(f"/api/events/{data['id']}/").data["role"], "manager")
        self.assertEqual(self.client.patch(f"/api/events/{data['id']}/", {"name": "X"}, format="json").status_code, 403)

    def test_report_totals(self):
        data = self.create_event()
        event = Event.objects.get(pk=data["id"])
        g1 = Guest.objects.create(event=event, full_name="A", side="bride")
        g2 = Guest.objects.create(event=event, full_name="B", side="groom")
        common = {"event": event, "currency": "USD", "client_created_at": "2026-11-01T10:00:00Z", "recorded_by": self.owner}
        Gift.objects.create(client_txn_id="00000000-0000-4000-8000-000000000001", guest=g1, amount=10, **common)
        Gift.objects.create(client_txn_id="00000000-0000-4000-8000-000000000002", guest=g2, amount=20, method="transfer", **common)
        Gift.objects.create(client_txn_id="00000000-0000-4000-8000-000000000003", walk_in_name="W", amount=5, **common)
        Gift.objects.create(client_txn_id="00000000-0000-4000-8000-000000000004", guest=g1, amount=999, voided=True, **common)
        report = self.client.get(f"/api/events/{event.pk}/report/").data
        self.assertEqual(report["count"], 3)
        self.assertEqual(float(report["total"]), 35)
        self.assertEqual(report["guests_with_gift"], 2)
        self.assertEqual(float(report["walk_in"]["total"]), 5)
        by_guest = {g["full_name"]: float(g["gift_total"]) for g in report["by_guest"]}
        self.assertEqual(by_guest["A"], 10)


class GuestTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user("owner", password="pw-123456")
        self.event = Event.objects.create(name="W", date="2026-10-24", created_by=self.user)
        EventMembership.objects.create(event=self.event, user=self.user, role="owner")
        self.client.force_authenticate(self.user)
        self.url = f"/api/events/{self.event.pk}/guests/"

    def test_full_list_excludes_deleted(self):
        Guest.objects.create(event=self.event, full_name="Kept")
        Guest.objects.create(event=self.event, full_name="Gone", is_deleted=True)
        data = self.client.get(self.url).data
        self.assertTrue(data["full"])
        self.assertEqual([g["full_name"] for g in data["results"]], ["Kept"])
        self.assertIn("server_time", data)

    def test_delta_sync_returns_changes_and_tombstones(self):
        keep = Guest.objects.create(event=self.event, full_name="Keep")
        gone = Guest.objects.create(event=self.event, full_name="Gone")
        server_time = self.client.get(self.url).data["server_time"]
        time.sleep(0.01)
        self.client.delete(f"{self.url}{gone.pk}/")
        self.client.post(self.url, {"full_name": "New"}, format="json")
        delta = self.client.get(self.url, {"updated_since": server_time}).data
        self.assertFalse(delta["full"])
        names = {g["full_name"]: g["is_deleted"] for g in delta["results"]}
        self.assertEqual(names, {"Gone": True, "New": False})
        self.assertNotIn(keep.full_name, names)
        self.assertTrue(Guest.objects.filter(pk=gone.pk).exists())  # soft delete

    def test_invalid_updated_since(self):
        self.assertEqual(self.client.get(self.url, {"updated_since": "nope"}).status_code, 400)

    def test_csv_import(self):
        csv_bytes = "full_name,nickname,phone,side,group,table_no\nAlice,Al,123,bride,Family,1\n,,,,,\nBob,,,groom,,2\nCarl,,,martian,,\n".encode()
        upload = SimpleUploadedFile("guests.csv", csv_bytes, content_type="text/csv")
        res = self.client.post(f"{self.url}import/", {"file": upload}, format="multipart")
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data["created"], 2)
        self.assertEqual([e["row"] for e in res.data["errors"]], [3, 5])
        self.assertEqual(set(Guest.objects.values_list("full_name", flat=True)), {"Alice", "Bob"})

    def test_csv_requires_full_name_header(self):
        upload = SimpleUploadedFile("g.csv", b"name\nA\n", content_type="text/csv")
        self.assertEqual(self.client.post(f"{self.url}import/", {"file": upload}, format="multipart").status_code, 400)
