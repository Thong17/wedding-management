import shutil
import tempfile

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework.test import APITestCase

User = get_user_model()

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
MEDIA = tempfile.mkdtemp()


@override_settings(MEDIA_ROOT=MEDIA)
class ProfileTests(APITestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(MEDIA, ignore_errors=True)

    def setUp(self):
        self.user = User.objects.create_user("sokha", password="pw-123456")
        User.objects.create_user("dara", password="pw-123456")
        self.client.force_authenticate(self.user)

    def test_me_has_no_avatar_by_default(self):
        res = self.client.get("/api/auth/me/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["username"], "sokha")
        self.assertIsNone(res.data["avatar_url"])

    def test_rename(self):
        res = self.client.patch("/api/auth/me/", {"username": "  sokha.chan "}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["username"], "sokha.chan")
        self.user.refresh_from_db()
        self.assertEqual(self.user.username, "sokha.chan")

    def test_rename_rejects_taken_name_case_insensitively(self):
        res = self.client.patch("/api/auth/me/", {"username": "DARA"}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertIn("username", res.data)

    def test_rename_rejects_invalid_and_blank(self):
        for bad in ["has space", ""]:
            res = self.client.patch("/api/auth/me/", {"username": bad}, format="json")
            self.assertEqual(res.status_code, 400, bad)

    def test_upload_replace_and_remove_avatar(self):
        res = self.client.patch("/api/auth/me/", {"avatar": SimpleUploadedFile("me.bin", PNG)}, format="multipart")
        self.assertEqual(res.status_code, 200, res.data)
        first = res.data["avatar_url"]
        self.assertRegex(first, r"/media/avatars/\d+-[0-9a-f]{12}\.png$")

        res = self.client.patch("/api/auth/me/", {"avatar": SimpleUploadedFile("me.png", PNG)}, format="multipart")
        self.assertNotEqual(res.data["avatar_url"], first)  # new name busts caches

        res = self.client.patch("/api/auth/me/", {"remove_avatar": "true"}, format="multipart")
        self.assertIsNone(res.data["avatar_url"])

    def test_rejects_non_image_and_oversized(self):
        res = self.client.patch("/api/auth/me/", {"avatar": SimpleUploadedFile("x.png", b"<script>")}, format="multipart")
        self.assertEqual(res.status_code, 400)
        big = SimpleUploadedFile("big.png", PNG + b"\x00" * (2 * 1024 * 1024))
        res = self.client.patch("/api/auth/me/", {"avatar": big}, format="multipart")
        self.assertEqual(res.status_code, 400)

    def test_failed_validation_changes_nothing(self):
        res = self.client.patch(
            "/api/auth/me/", {"username": "new-name", "avatar": SimpleUploadedFile("x.png", b"nope")}, format="multipart"
        )
        self.assertEqual(res.status_code, 400)
        self.user.refresh_from_db()
        self.assertEqual(self.user.username, "sokha")

    def test_token_keeps_working_after_rename(self):
        self.client.force_authenticate(None)
        token = self.client.post("/api/auth/token/", {"username": "sokha", "password": "pw-123456"}, format="json").data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        self.client.patch("/api/auth/me/", {"username": "renamed"}, format="json")
        self.assertEqual(self.client.get("/api/auth/me/").data["username"], "renamed")
