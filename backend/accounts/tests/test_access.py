"""The access rules from docs/accounts-plan.md, end to end through the API."""

import shutil
import tempfile
import uuid
from datetime import timedelta

from django.core.files.storage import FileSystemStorage
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.models import Client, ClientDocument, Profile
from events.models import Event, EventAssignment, Guest, Role
from events.tests.factories import assign, default_role, make_client, make_client_admin, make_platform_admin, make_user
from gifts.models import Gift

UserType = Profile.UserType
PDF = b"%PDF-1.4\n" + b"0" * 64


def txn(event, guest, **extra):
    return {
        "client_txn_id": str(uuid.uuid4()), "event_id": event.pk, "guest_id": guest.pk, "amount": "10.00",
        "method": "cash", "client_created_at": timezone.now().isoformat(), **extra,
    }


class Base(APITestCase):
    def setUp(self):
        self.root = make_platform_admin()
        self.org = make_client("Angkor Weddings")
        self.other_org = make_client("Other Co")
        self.admin = make_client_admin("org_admin", self.org)
        self.other_admin = make_client_admin("other_admin", self.other_org)
        self.customer = make_user("bride_side", client=self.org)
        self.other_customer = make_user("other_customer", client=self.other_org)
        self.standalone = make_user("solo")
        self.event = Event.objects.create(name="Sokha & Dara", date="2026-12-01", created_by=self.admin, client=self.org)
        self.other_event = Event.objects.create(name="Other", date="2026-12-02", created_by=self.other_admin, client=self.other_org)
        self.guest = Guest.objects.create(event=self.event, full_name="Uncle Bo")

    def as_(self, user):
        # A fresh copy each time, like a real request, so cached profile/client data isn't stale.
        self.client.force_authenticate(type(user).objects.get(pk=user.pk))

    def event_ids(self):
        return sorted(e["id"] for e in self.client.get("/api/events/").data)


class VisibilityTests(Base):
    def test_who_sees_which_events(self):
        assign(self.customer, self.event)
        self.as_(self.root)
        self.assertEqual(self.event_ids(), sorted([self.event.pk, self.other_event.pk]))
        self.as_(self.admin)
        self.assertEqual(self.event_ids(), [self.event.pk])
        self.as_(self.customer)
        self.assertEqual(self.event_ids(), [self.event.pk])
        self.as_(self.other_customer)
        self.assertEqual(self.event_ids(), [])
        # Another client's event looks missing, not forbidden.
        self.assertEqual(self.client.get(f"/api/events/{self.event.pk}/").status_code, 404)

    def test_unassigned_customer_of_same_client_sees_nothing(self):
        self.as_(self.customer)
        self.assertEqual(self.event_ids(), [])
        self.assertEqual(self.client.get(f"/api/events/{self.event.pk}/guests/").status_code, 404)

    def test_event_payload_lists_my_permissions(self):
        assign(self.customer, self.event, permissions=["gift_desk", "report_view"])
        self.as_(self.customer)
        data = self.client.get(f"/api/events/{self.event.pk}/").data
        self.assertEqual((data["permissions"], data["full_access"], data["role"]), (["gift_desk", "report_view"], False, "manager"))


class CreateEventTests(Base):
    body = {"name": "New", "date": "2026-12-10", "currency": "USD"}

    def test_customers_cannot_create_events(self):
        self.as_(self.customer)
        self.assertEqual(self.client.post("/api/events/", self.body, format="json").status_code, 403)

    def test_client_admin_events_belong_to_their_client_and_cannot_pick_another(self):
        self.as_(self.admin)
        self.assertEqual(self.client.post("/api/events/", self.body, format="json").data["client"], self.org.pk)
        res = self.client.post("/api/events/", {**self.body, "client": self.other_org.pk}, format="json")
        self.assertEqual(res.status_code, 400)

    def test_platform_admin_picks_any_client_or_none(self):
        self.as_(self.root)
        self.assertEqual(self.client.post("/api/events/", {**self.body, "client": self.other_org.pk}, format="json").data["client"], self.other_org.pk)
        self.assertIsNone(self.client.post("/api/events/", self.body, format="json").data["client"])

    def test_only_full_access_edits_or_deletes(self):
        assign(self.customer, self.event, permissions=["gift_desk", "guest_add", "guest_edit", "guest_delete"])
        self.as_(self.customer)
        url = f"/api/events/{self.event.pk}/"
        self.assertEqual(self.client.patch(url, {"name": "X"}, format="json").status_code, 403)
        self.assertEqual(self.client.delete(url).status_code, 403)
        self.as_(self.other_admin)
        self.assertEqual(self.client.patch(url, {"name": "X"}, format="json").status_code, 404)
        self.as_(self.admin)
        self.assertEqual(self.client.patch(url, {"name": "Renamed"}, format="json").status_code, 200)


class RolePermissionTests(Base):
    def guests_url(self, pk=""):
        return f"/api/events/{self.event.pk}/guests/{f'{pk}/' if pk else ''}"

    def test_each_guest_action_needs_its_permission(self):
        assign(self.customer, self.event, permissions=["gift_desk"])
        self.as_(self.customer)
        self.assertEqual(self.client.get(self.guests_url()).status_code, 200)  # the desk needs the list
        self.assertEqual(self.client.post(self.guests_url(), {"full_name": "A"}, format="json").status_code, 403)
        self.assertEqual(self.client.patch(self.guests_url(self.guest.pk), {"full_name": "B"}, format="json").status_code, 403)
        self.assertEqual(self.client.delete(self.guests_url(self.guest.pk)).status_code, 403)
        csv = SimpleUploadedFile("g.csv", b"full_name\nA\n", content_type="text/csv")
        self.assertEqual(self.client.post(f"{self.guests_url()}import/", {"file": csv}, format="multipart").status_code, 403)
        self.assertEqual(self.client.get(f"/api/events/{self.event.pk}/report/").status_code, 403)
        self.assertEqual(self.client.get(f"/api/events/{self.event.pk}/gifts/").status_code, 403)

    def test_granted_permissions_work(self):
        assign(self.customer, self.event, permissions=["guest_add", "guest_edit", "guest_delete", "guest_import", "report_view"])
        self.as_(self.customer)
        self.assertEqual(self.client.post(self.guests_url(), {"full_name": "A"}, format="json").status_code, 201)
        self.assertEqual(self.client.patch(self.guests_url(self.guest.pk), {"full_name": "B"}, format="json").status_code, 200)
        csv = SimpleUploadedFile("g.csv", b"full_name\nC\n", content_type="text/csv")
        self.assertEqual(self.client.post(f"{self.guests_url()}import/", {"file": csv}, format="multipart").status_code, 201)
        self.assertEqual(self.client.get(f"/api/events/{self.event.pk}/report/").status_code, 200)
        self.assertEqual(self.client.get(f"/api/events/{self.event.pk}/gifts/").status_code, 200)  # report_view can list
        self.assertEqual(self.client.delete(self.guests_url(self.guest.pk)).status_code, 204)

    def test_gift_corrections_need_gift_edit(self):
        gift = Gift.objects.create(
            client_txn_id=uuid.uuid4(), event=self.event, guest=self.guest, amount=10, currency="USD",
            client_created_at=timezone.now(), recorded_by=self.admin,
        )
        url = f"/api/events/{self.event.pk}/gifts/{gift.pk}/"
        body = {"amount": "20", "updated_at": gift.updated_at.isoformat()}
        assign(self.customer, self.event, permissions=["report_view"])
        self.as_(self.customer)
        self.assertEqual(self.client.patch(url, body, format="json").status_code, 403)
        EventAssignment.objects.filter(user=self.customer).update(role=Role.objects.create(name="Fixer", client=self.org, permissions=["gift_edit"]))
        self.assertEqual(self.client.patch(url, body, format="json").status_code, 200)

    def test_editing_and_voiding_are_separate(self):
        gift = Gift.objects.create(
            client_txn_id=uuid.uuid4(), event=self.event, guest=self.guest, amount=10, currency="USD",
            client_created_at=timezone.now(), recorded_by=self.admin,
        )
        url = f"/api/events/{self.event.pk}/gifts/{gift.pk}/"
        assign(self.customer, self.event, permissions=["gift_edit"])
        self.as_(self.customer)
        self.assertEqual(self.client.post(f"{url}void/", {"updated_at": gift.updated_at.isoformat()}, format="json").status_code, 403)
        EventAssignment.objects.filter(user=self.customer).update(role=Role.objects.create(name="Voider", client=self.org, permissions=["gift_void"]))
        self.assertEqual(self.client.patch(url, {"amount": "20", "updated_at": gift.updated_at.isoformat()}, format="json").status_code, 403)
        self.assertEqual(self.client.post(f"{url}void/", {"updated_at": gift.updated_at.isoformat()}, format="json").status_code, 200)

    def test_own_permissions_cover_only_gifts_the_user_recorded(self):
        def gift_by(user):
            return Gift.objects.create(
                client_txn_id=uuid.uuid4(), event=self.event, guest=self.guest, amount=10, currency="USD",
                client_created_at=timezone.now(), recorded_by=user,
            )

        mine, theirs = gift_by(self.customer), gift_by(self.admin)
        url = lambda g: f"/api/events/{self.event.pk}/gifts/{g.pk}/"  # noqa: E731
        assign(self.customer, self.event, permissions=["gift_desk", "gift_edit_own", "gift_void_own"])
        self.as_(self.customer)
        # Reading one's own gift (the desk does before a change) is fine; the whole list is not.
        self.assertEqual(self.client.get(url(mine)).status_code, 200)
        self.assertEqual(self.client.get(url(theirs)).status_code, 403)
        self.assertEqual(self.client.get(f"/api/events/{self.event.pk}/gifts/").status_code, 403)
        body = lambda g: {"amount": "20", "updated_at": g.updated_at.isoformat()}  # noqa: E731
        self.assertEqual(self.client.patch(url(theirs), body(theirs), format="json").status_code, 403)
        self.assertEqual(self.client.patch(url(mine), body(mine), format="json").status_code, 200)
        mine.refresh_from_db()
        self.assertEqual(self.client.post(f"{url(theirs)}void/", {"updated_at": theirs.updated_at.isoformat()}, format="json").status_code, 403)
        self.assertEqual(self.client.post(f"{url(mine)}void/", {"updated_at": mine.updated_at.isoformat()}, format="json").status_code, 200)

    def test_sync_needs_gift_desk_per_event(self):
        assign(self.customer, self.event, permissions=["guest_add"])
        self.as_(self.customer)
        result = self.client.post("/api/gifts/sync/", {"transactions": [txn(self.event, self.guest)]}, format="json").data["results"][0]
        self.assertEqual((result["status"], result["code"]), ("rejected", "forbidden"))
        EventAssignment.objects.filter(user=self.customer).update(role=default_role())
        result = self.client.post("/api/gifts/sync/", {"transactions": [txn(self.event, self.guest)]}, format="json").data["results"][0]
        self.assertEqual(result["status"], "created")


class AssignmentTests(Base):
    def url(self, event=None):
        return f"/api/events/{(event or self.event).pk}/assignments/"

    def test_client_admin_assigns_only_their_own_customers(self):
        self.as_(self.admin)
        self.assertEqual(self.client.post(self.url(), {"username": "bride_side"}, format="json").status_code, 201)
        self.assertEqual(self.client.post(self.url(), {"username": "other_customer"}, format="json").status_code, 400)
        self.assertEqual(self.client.post(self.url(), {"username": "solo"}, format="json").status_code, 400)
        self.assertEqual(self.client.post(self.url(), {"username": "other_admin"}, format="json").status_code, 400)

    def test_platform_admin_assigns_any_customer(self):
        self.as_(self.root)
        self.assertEqual(self.client.post(self.url(), {"username": "solo"}, format="json").status_code, 201)
        self.assertEqual(self.client.post(self.url(), {"username": "other_customer"}, format="json").status_code, 201)

    def test_roles_must_be_global_or_the_events_client(self):
        mine = Role.objects.create(name="Desk only", client=self.org, permissions=["gift_desk"])
        theirs = Role.objects.create(name="Theirs", client=self.other_org, permissions=["gift_desk"])
        self.as_(self.admin)
        self.assertEqual(self.client.post(self.url(), {"username": "bride_side", "role_id": theirs.pk}, format="json").status_code, 400)
        res = self.client.post(self.url(), {"username": "bride_side", "role_id": mine.pk}, format="json")
        self.assertEqual((res.status_code, res.data["role_name"]), (201, "Desk only"))
        # Change the role, then remove the assignment.
        detail = f"{self.url()}{res.data['id']}/"
        self.assertEqual(self.client.patch(detail, {"role_id": default_role().pk}, format="json").data["role_name"], "Default")
        self.assertEqual(self.client.delete(detail).status_code, 204)

    def test_customers_cannot_assign_and_owner_role_is_refused(self):
        assign(self.customer, self.event)
        self.as_(self.customer)
        self.assertEqual(self.client.post(self.url(), {"username": "bride_side"}, format="json").status_code, 403)
        self.as_(self.admin)
        res = self.client.post(f"/api/events/{self.event.pk}/members/", {"username": "bride_side", "role": "owner"}, format="json")
        self.assertEqual(res.status_code, 400)


class LockoutTests(Base):
    def setUp(self):
        super().setUp()
        assign(self.customer, self.event)
        yesterday = timezone.localdate() - timedelta(days=1)
        self.org.status, self.org.trial_ends_at = Client.Status.TRIAL, yesterday
        self.org.save()

    def assert_locked(self, user, reason="trial_ended"):
        self.as_(user)
        res = self.client.get("/api/events/")
        self.assertEqual((res.status_code, res.data["code"], res.data["reason"]), (403, "account_locked", reason))
        self.assertEqual(self.client.get(f"/api/events/{self.event.pk}/guests/").status_code, 403)
        self.assertEqual(self.client.get("/api/auth/me/").data["lock_reason"], reason)  # lock screen can load
        self.assertEqual(self.client.patch("/api/auth/me/", {"username": "x"}, format="json").status_code, 403)

    def test_expired_client_locks_its_admins_and_customers(self):
        self.assert_locked(self.admin)
        self.assert_locked(self.customer)

    def test_every_endpoint_refuses_a_locked_login(self):
        self.as_(self.admin)
        e = self.event.pk
        urls = [
            "/api/events/", f"/api/events/{e}/", f"/api/events/{e}/guests/", f"/api/events/{e}/gifts/",
            f"/api/events/{e}/report/", f"/api/events/{e}/assignments/", f"/api/events/{e}/members/",
            "/api/clients/", f"/api/clients/{self.org.pk}/", f"/api/clients/{self.org.pk}/documents/",
            "/api/users/", "/api/roles/", "/api/permissions/",
        ]
        for url in urls:
            res = self.client.get(url)
            self.assertEqual((res.status_code, res.data.get("code")), (403, "account_locked"), url)
        res = self.client.post("/api/auth/password/", {"current_password": "pw-123456", "new_password": "New-password-42"}, format="json")
        self.assertEqual(res.status_code, 403)

    def test_gifts_still_upload_when_locked(self):
        self.as_(self.customer)
        result = self.client.post("/api/gifts/sync/", {"transactions": [txn(self.event, self.guest)]}, format="json").data["results"][0]
        self.assertEqual(result["status"], "created")

    def test_trial_end_day_itself_still_works_and_extending_unlocks(self):
        self.org.trial_ends_at = timezone.localdate()
        self.org.save()
        self.as_(self.admin)
        self.assertEqual(self.client.get("/api/events/").status_code, 200)

    def test_suspended_and_active(self):
        self.org.status = Client.Status.SUSPENDED
        self.org.save()
        self.assert_locked(self.customer, "suspended")
        self.org.status = Client.Status.ACTIVE  # active ignores the old trial date
        self.org.save()
        self.as_(self.customer)
        self.assertEqual(self.client.get("/api/events/").status_code, 200)

    def test_standalone_customer_uses_own_date_and_admin_is_never_locked(self):
        profile = self.standalone.profile
        profile.trial_ends_at = timezone.localdate() - timedelta(days=1)
        profile.save()
        self.assert_locked(self.standalone)
        Client.objects.update(status=Client.Status.SUSPENDED)
        self.as_(self.root)
        self.assertEqual(self.client.get("/api/events/").status_code, 200)

    def test_customers_of_a_client_have_no_own_end_date(self):
        self.org.status = Client.Status.ACTIVE
        self.org.save()
        Profile.objects.filter(user=self.customer).update(trial_ends_at=timezone.localdate() - timedelta(days=30))
        self.as_(self.customer)
        self.assertEqual(self.client.get("/api/events/").status_code, 200)


class RoleApiTests(Base):
    def test_client_admin_sees_global_and_own_roles_only(self):
        Role.objects.create(name="Theirs", client=self.other_org, permissions=[])
        mine = Role.objects.create(name="Mine", client=self.org, permissions=[])
        self.as_(self.admin)
        names = {r["name"] for r in self.client.get("/api/roles/").data}
        self.assertEqual(names, {"Default", "Mine"})
        self.assertEqual(self.client.get(f"/api/roles/{mine.pk}/").data["editable"], True)

    def test_client_admin_manages_own_roles_but_not_global_ones(self):
        self.as_(self.admin)
        res = self.client.post("/api/roles/", {"name": "Desk only", "permissions": ["gift_desk", "gift_desk"]}, format="json")
        self.assertEqual((res.status_code, res.data["client"], res.data["permissions"]), (201, self.org.pk, ["gift_desk"]))
        self.assertEqual(res.data["updated_by_username"], "org_admin")
        self.assertEqual(self.client.patch(f"/api/roles/{default_role().pk}/", {"permissions": []}, format="json").status_code, 403)
        self.assertEqual(self.client.post("/api/roles/", {"name": "Bad", "permissions": ["fly"]}, format="json").status_code, 400)
        self.assertEqual(self.client.post("/api/roles/", {"name": "desk ONLY", "permissions": []}, format="json").status_code, 400)

    def test_platform_admin_can_fix_a_clients_role(self):
        role = Role.objects.create(name="Oops", client=self.org, permissions=["guest_delete"])
        self.as_(self.root)
        res = self.client.patch(f"/api/roles/{role.pk}/", {"permissions": ["gift_desk"]}, format="json")
        self.assertEqual((res.status_code, res.data["permissions"], res.data["updated_by_username"]), (200, ["gift_desk"], "root"))

    def test_roles_in_use_and_default_are_protected(self):
        role = Role.objects.create(name="Used", client=self.org, permissions=["gift_desk"])
        assign(self.customer, self.event, role=role)
        self.as_(self.admin)
        res = self.client.get(f"/api/roles/{role.pk}/")
        self.assertEqual(res.data["usage_count"], 1)
        self.assertEqual(self.client.delete(f"/api/roles/{role.pk}/").status_code, 400)
        self.as_(self.root)
        self.assertEqual(self.client.delete(f"/api/roles/{default_role().pk}/").status_code, 400)
        self.assertEqual(self.client.patch(f"/api/roles/{default_role().pk}/", {"name": "Basic"}, format="json").status_code, 400)

    def test_customers_have_no_role_api(self):
        self.as_(self.customer)
        self.assertEqual(self.client.get("/api/roles/").status_code, 403)
        self.assertEqual(self.client.get("/api/permissions/").status_code, 200)


class ClientApiTests(Base):
    def test_platform_admin_creates_client_with_default_trial(self):
        self.as_(self.root)
        res = self.client.post("/api/clients/", {"business_name": "Hall", "subscription_price": "30.00", "billing_period": "monthly"}, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data["status"], "trial")
        self.assertEqual(res.data["trial_ends_at"], str(timezone.localdate() + timedelta(days=14)))

    def test_blank_trial_date_gets_the_default_like_the_forms_send_it(self):
        self.as_(self.root)
        default = str(timezone.localdate() + timedelta(days=14))
        res = self.client.post("/api/clients/", {"business_name": "Blank", "trial_ends_at": None, "billing_period": "", "subscription_price": None}, format="json")
        self.assertEqual((res.status_code, res.data["trial_ends_at"]), (201, default))
        res = self.client.post("/api/users/", {"username": "walkin2", "password": "Long-enough-9", "user_type": "customer", "client": None, "trial_ends_at": None}, format="json")
        self.assertEqual((res.status_code, res.data["trial_ends_at"]), (201, default))

    def test_client_admin_sees_only_their_client_read_only(self):
        self.as_(self.admin)
        data = self.client.get("/api/clients/").data
        self.assertEqual([c["id"] for c in data], [self.org.pk])
        self.assertEqual(data[0]["admin_count"], 1)
        self.assertEqual(self.client.get(f"/api/clients/{self.other_org.pk}/").status_code, 404)
        self.assertEqual(self.client.patch(f"/api/clients/{self.org.pk}/", {"status": "active"}, format="json").status_code, 403)
        self.as_(self.customer)
        self.assertEqual(self.client.get("/api/clients/").status_code, 403)

    def test_client_with_logins_cannot_be_deleted(self):
        self.as_(self.root)
        self.assertEqual(self.client.delete(f"/api/clients/{self.org.pk}/").status_code, 400)


class DocumentTests(Base):
    def setUp(self):
        super().setUp()
        self.tmp = tempfile.mkdtemp()
        self.field = ClientDocument._meta.get_field("file")
        self.saved_storage = self.field.storage
        self.field.storage = FileSystemStorage(location=self.tmp)

    def tearDown(self):
        self.field.storage = self.saved_storage
        shutil.rmtree(self.tmp, ignore_errors=True)
        super().tearDown()

    def url(self, org=None):
        return f"/api/clients/{(org or self.org).pk}/documents/"

    def upload(self, content=PDF, **fields):
        return self.client.post(self.url(), {"file": SimpleUploadedFile("license.pdf", content), "doc_type": "business_license", **fields}, format="multipart")

    def test_admin_uploads_and_owner_client_downloads_privately(self):
        self.as_(self.root)
        res = self.upload(number="BL-123", expires_on="2027-01-01")
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual((res.data["content_type"], res.data["original_name"]), ("application/pdf", "license.pdf"))
        self.assertNotIn("url", res.data)
        self.as_(self.admin)
        self.assertEqual(len(self.client.get(self.url()).data), 1)
        dl = self.client.get(f"{self.url()}{res.data['id']}/download/")
        self.assertEqual(dl.status_code, 200)
        self.assertEqual(b"".join(dl.streaming_content), PDF)
        self.assertEqual(dl["Cache-Control"], "no-store")

    def test_rejects_non_documents_and_bad_dates(self):
        self.as_(self.root)
        self.assertEqual(self.upload(content=b"<html>").status_code, 400)
        self.assertEqual(self.upload(issued_on="2027-01-02", expires_on="2027-01-01").status_code, 400)

    def test_other_clients_and_writes_are_refused(self):
        self.as_(self.root)
        doc_id = self.upload().data["id"]
        self.as_(self.other_admin)
        self.assertEqual(self.client.get(self.url()).status_code, 403)
        self.assertEqual(self.client.get(f"{self.url()}{doc_id}/download/").status_code, 403)
        self.as_(self.admin)
        self.assertEqual(self.client.patch(f"{self.url()}{doc_id}/", {"notes": "x"}, format="multipart").status_code, 403)
        self.assertEqual(self.upload().status_code, 403)


class UserApiTests(Base):
    def test_client_admin_creates_customers_for_their_own_client(self):
        self.as_(self.admin)
        res = self.client.post("/api/users/", {"username": "groom_side", "password": "Long-enough-9"}, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual((res.data["user_type"], res.data["client"], res.data["trial_ends_at"]), ("customer", self.org.pk, None))
        for extra in ({"user_type": "client_admin"}, {"client": self.other_org.pk}, {"trial_ends_at": "2030-01-01"}):
            res = self.client.post("/api/users/", {"username": f"x{len(extra)}", "password": "Long-enough-9", **extra}, format="json")
            self.assertEqual(res.status_code, 400, extra)

    def test_client_admin_lists_and_edits_only_their_customers(self):
        self.as_(self.admin)
        names = {u["username"] for u in self.client.get("/api/users/").data}
        self.assertEqual(names, {"org_admin", "bride_side"})
        self.assertEqual(self.client.patch(f"/api/users/{self.customer.pk}/", {"is_active": False}, format="json").status_code, 200)
        self.assertEqual(self.client.patch(f"/api/users/{self.other_customer.pk}/", {"is_active": False}, format="json").status_code, 404)
        co_admin = make_client_admin("co_admin", self.org)
        self.assertEqual(self.client.patch(f"/api/users/{co_admin.pk}/", {"is_active": False}, format="json").status_code, 403)
        self.assertEqual(self.client.patch(f"/api/users/{self.admin.pk}/", {"is_active": False}, format="json").status_code, 403)

    def test_reset_password(self):
        self.as_(self.admin)
        url = f"/api/users/{self.customer.pk}/reset-password/"
        self.assertEqual(self.client.post(url, {"password": "123"}, format="json").status_code, 400)
        self.assertEqual(self.client.post(url, {"password": "New-password-42"}, format="json").status_code, 204)
        self.customer.refresh_from_db()
        self.assertTrue(self.customer.check_password("New-password-42"))

    def test_platform_admin_rules(self):
        self.as_(self.root)
        res = self.client.post("/api/users/", {"username": "boss", "password": "Long-enough-9", "user_type": "client_admin"}, format="json")
        self.assertEqual(res.status_code, 400)  # a client admin needs a client
        res = self.client.post("/api/users/", {"username": "boss", "password": "Long-enough-9", "user_type": "client_admin", "client": self.org.pk}, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        res = self.client.post("/api/users/", {"username": "walkin", "password": "Long-enough-9"}, format="json")
        self.assertEqual(res.data["trial_ends_at"], str(timezone.localdate() + timedelta(days=14)))  # standalone default
        self.assertEqual(self.client.patch(f"/api/users/{self.root.pk}/", {"first_name": "x"}, format="json").status_code, 403)
        self.as_(self.customer)
        self.assertEqual(self.client.get("/api/users/").status_code, 403)


class PasswordTests(Base):
    def test_change_own_password(self):
        self.as_(self.customer)
        url = "/api/auth/password/"
        self.assertEqual(self.client.post(url, {"current_password": "wrong", "new_password": "New-password-42"}, format="json").status_code, 400)
        self.assertEqual(self.client.post(url, {"current_password": "pw-123456", "new_password": "short"}, format="json").status_code, 400)
        self.assertEqual(self.client.post(url, {"current_password": "pw-123456", "new_password": "New-password-42"}, format="json").status_code, 204)
        self.customer.refresh_from_db()
        self.assertTrue(self.customer.check_password("New-password-42"))

    def test_me_reports_type_client_and_access_end(self):
        self.as_(self.admin)
        data = self.client.get("/api/auth/me/").data
        self.assertEqual((data["user_type"], data["client"]["business_name"], data["lock_reason"]), ("client_admin", "Angkor Weddings", None))
        self.as_(self.root)
        self.assertEqual(self.client.get("/api/auth/me/").data["user_type"], "platform_admin")
