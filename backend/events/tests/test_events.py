import time

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APITestCase

from events.models import Event, Guest
from events.tests.factories import make_client, make_client_admin, make_user
from gifts.models import Gift

User = get_user_model()


class EventTests(APITestCase):
    def setUp(self):
        self.org = make_client()
        self.owner = make_client_admin("owner", self.org)
        self.manager = make_user("helper", client=self.org)
        self.outsider = make_user("outsider", client=make_client("Other Co"))
        self.client.force_authenticate(self.owner)

    def create_event(self):
        res = self.client.post("/api/events/", {"name": "Wedding", "date": "2026-11-01", "currency": "usd"}, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        return res.data

    def test_client_admin_creates_event_for_their_client(self):
        data = self.create_event()
        self.assertEqual((data["role"], data["full_access"], data["client"]), ("owner", True, self.org.pk))
        self.assertEqual(data["currency"], "USD")
        self.assertEqual(len(data["permissions"]), 14)

    def test_outsider_cannot_see_event(self):
        data = self.create_event()
        self.client.force_authenticate(self.outsider)
        self.assertEqual(self.client.get("/api/events/").data, [])
        self.assertEqual(self.client.get(f"/api/events/{data['id']}/").status_code, 404)
        self.assertEqual(self.client.get(f"/api/events/{data['id']}/guests/").status_code, 404)

    def test_manager_can_read_but_not_edit_event(self):
        data = self.create_event()
        res = self.client.post(f"/api/events/{data['id']}/members/", {"username": "helper"}, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data["role_name"], "Default")
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
        org = make_client()
        self.user = make_client_admin("owner", org)
        self.event = Event.objects.create(name="W", date="2026-10-24", created_by=self.user, client=org)
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

    def test_csv_import_accepts_downloadable_template(self):
        # Exactly what the frontend template download produces (BOM + header + CRLF),
        # filled in the way Excel saves it, with a Khmer name and a blank side.
        template = "﻿full_name,nickname,phone,side,group,table_no\r\n"
        filled = template + "សុខា ចាន់,Sokha,012345678,,Family,3\r\nDara,,,groom,,\r\n"
        upload = SimpleUploadedFile("guests-template.csv", filled.encode("utf-8"), content_type="text/csv")
        res = self.client.post(f"{self.url}import/", {"file": upload}, format="multipart")
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual((res.data["created"], res.data["errors"]), (2, []))
        sokha = Guest.objects.get(nickname="Sokha")
        self.assertEqual((sokha.full_name, sokha.side, sokha.phone), ("សុខា ចាន់", "both", "012345678"))

    def test_csv_requires_full_name_header(self):
        upload = SimpleUploadedFile("g.csv", b"name\nA\n", content_type="text/csv")
        self.assertEqual(self.client.post(f"{self.url}import/", {"file": upload}, format="multipart").status_code, 400)


class InviteQrTests(APITestCase):
    def setUp(self):
        self.owner = make_client_admin("owner", make_client())
        self.client.force_authenticate(self.owner)

    def save(self, invite_qr):
        return self.client.post(
            "/api/events/",
            {"name": "Wedding", "date": "2026-11-01", "currency": "usd", "invite_qr": invite_qr},
            format="json",
        )

    def test_crc_matches_frontend(self):
        from events.invite_qr import crc16

        self.assertEqual(crc16("123456789"), "29B1")  # same check value as the frontend test

    def test_accepts_blank_link_and_valid_bank_qr(self):
        from events.invite_qr import crc16

        body = "00020101021129190015sokha_chan@aclb5204599953038405802KH5910SOKHA CHAN6010Phnom Penh6304"
        for value in ["", "https://www.google.com/maps/search/?api=1&query=11.55,104.92", body + crc16(body)]:
            res = self.save(value)
            self.assertEqual(res.status_code, 201, (value, res.data))
            self.assertEqual(res.data["invite_qr"], value)

    def test_rejects_bad_checksum_and_non_links(self):
        body = "00020101021129190015sokha_chan@aclb5204599953038405802KH5910SOKHA CHAN6010Phnom Penh6304"
        for value in [body + "0000", "ftp://example.com", "just text", "maps.google.com/x"]:
            res = self.save(value)
            self.assertEqual(res.status_code, 400, value)
            self.assertIn("invite_qr", res.data)
