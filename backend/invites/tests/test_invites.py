import shutil
import tempfile
from datetime import timedelta

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from events.models import Event, Guest, Permission
from events.tests.factories import assign, make_client, make_client_admin, make_user
from invites.models import EInvite, InviteImage

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64

MEDIA = tempfile.mkdtemp()


@override_settings(MEDIA_ROOT=MEDIA)
class InviteTests(APITestCase):
    """Designing an event's invitation, publishing it, and what guests can see without logging in."""

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(MEDIA, ignore_errors=True)

    def setUp(self):
        self.org = make_client()
        self.owner = make_client_admin("owner", self.org)
        self.event = Event.objects.create(
            name="Sokha & Dara", date="2026-12-12", venue="Sokha Hotel", currency="USD", created_by=self.owner, client=self.org,
        )
        Guest.objects.create(event=self.event, full_name="Private Guest", phone="012 345 678")
        self.url = reverse("invite", args=[self.event.pk])
        self.client.force_authenticate(self.owner)

    def save(self, draft=None, revision=None, **extra):
        if draft is None:
            draft = self.client.get(self.url).data["draft"]
        if revision is None:
            revision = self.client.get(self.url).data["revision"]
        return self.client.put(self.url, {"draft": draft, "revision": revision, **extra}, format="json")

    def publish(self):
        revision = self.client.get(self.url).data["revision"]
        return self.client.post(reverse("invite-publish", args=[self.event.pk]), {"revision": revision}, format="json")

    def public(self, slug):
        self.client.force_authenticate(None)
        try:
            return self.client.get(reverse("public-invite", args=[slug]))
        finally:
            self.client.force_authenticate(self.owner)

    def upload(self, content=PNG, name="photo.png"):
        return self.client.post(
            reverse("invite-images", args=[self.event.pk]), {"image": SimpleUploadedFile(name, content)}, format="multipart",
        )

    # Editing

    def test_a_new_invite_starts_from_defaults_with_the_couple_s_names_from_the_event(self):
        data = self.client.get(self.url).data
        self.assertEqual((data["status"], data["revision"], data["slug"]), ("draft", 0, None))
        for lang in ("km", "en"):
            words = data["draft"]["content"]["text"][lang]
            self.assertEqual((words["partner1"], words["partner2"]), ("Sokha", "Dara"))
        self.assertEqual(data["draft"]["audio"], {"music": "musicbox", "volume": 60, "open_sound": True, "music_file": None})
        self.assertEqual(data["draft"]["animation"]["style"], "gatefold")
        self.assertFalse(EInvite.objects.exists())  # nothing stored until it is saved

    def test_saving_keeps_valid_values_drops_unknown_keys_and_fills_defaults(self):
        res = self.save({"design": {"background": "#112233", "nonsense": 1}, "content": {"text": {"en": {"greeting": "  Welcome  "}}}})
        self.assertEqual(res.status_code, 200)
        draft = res.data["draft"]
        self.assertEqual(draft["design"]["background"], "#112233")
        self.assertNotIn("nonsense", draft["design"])
        self.assertEqual(draft["content"]["text"]["en"]["greeting"], "Welcome")
        self.assertEqual(draft["design"]["font"], "classic")  # default filled in
        self.assertEqual(res.data["revision"], 1)

    def test_invalid_values_are_refused_by_field(self):
        cases = [
            ({"design": {"background": "red"}}, "design.background"),
            ({"design": {"font": "comic-sans"}}, "design.font"),
            ({"content": {"timeline": [{"maps_url": "javascript:alert(1)"}]}}, "content.timeline.0.maps_url"),
            ({"content": {"gallery": [999]}}, "content.gallery"),
            ({"content": {"text": {"en": {"title": "x" * 121}}}}, "content.text.en.title"),
            ({"audio": {"music": "rock"}}, "audio.music"),
            ({"audio": {"volume": 101}}, "audio.volume"),
            ({"audio": {"music_file": 999}}, "audio.music_file"),
            ({"animation": {"enabled": "yes"}}, "animation.enabled"),
        ]
        for draft, field in cases:
            with self.subTest(field=field):
                res = self.save(draft, revision=0)
                self.assertEqual(res.status_code, 400)
                self.assertIn(field, res.data)

    def test_a_stale_revision_is_refused_with_the_current_version(self):
        self.save({}, revision=0)
        res = self.save({"content": {"text": {"en": {"title": "Late"}}}}, revision=0)
        self.assertEqual(res.status_code, 409)
        self.assertEqual(res.data["current"]["revision"], 1)

    def test_editing_needs_the_design_permission(self):
        designer, desk = make_user("designer", client=self.org), make_user("desk", client=self.org)
        assign(designer, self.event, permissions=[Permission.INVITE_EDIT])
        assign(desk, self.event, permissions=[Permission.GIFT_DESK])
        self.client.force_authenticate(desk)
        self.assertEqual(self.client.get(self.url).status_code, 403)
        self.assertEqual(self.upload().status_code, 403)
        self.client.force_authenticate(designer)
        self.assertEqual(self.client.get(self.url).status_code, 200)
        self.client.force_authenticate(make_user("outsider", client=self.org))
        self.assertIn(self.client.get(self.url).status_code, (403, 404))

    # Publishing

    def test_publishing_picks_a_link_and_guests_see_only_the_published_design(self):
        self.save({"content": {"text": {"en": {"title": "Our Wedding"}}}}, revision=0)
        res = self.publish()
        self.assertEqual(res.status_code, 200)
        slug = res.data["slug"]
        self.assertRegex(slug, r"^sokha-dara-[0-9a-f]{4}$")
        self.assertEqual((res.data["status"], res.data["has_changes"]), ("published", False))

        self.save({"content": {"text": {"en": {"title": "Changed, not published"}}}})
        self.assertTrue(self.client.get(self.url).data["has_changes"])
        public = self.public(slug)
        self.assertEqual(public.status_code, 200)
        self.assertEqual(public.data["content"]["text"]["en"]["title"], "Our Wedding")

        self.publish()  # republish
        self.assertEqual(self.public(slug).data["content"]["text"]["en"]["title"], "Changed, not published")
        self.assertEqual(self.client.get(self.url).data["slug"], slug)  # the link stays the same

    def test_publishing_needs_a_saved_draft(self):
        res = self.client.post(reverse("invite-publish", args=[self.event.pk]), {"revision": 0}, format="json")
        self.assertEqual(res.status_code, 400)

    def test_unpublishing_takes_the_page_down_but_keeps_the_link(self):
        self.save({}, revision=0)
        slug = self.publish().data["slug"]
        self.client.post(reverse("invite-unpublish", args=[self.event.pk]))
        self.assertEqual(self.public(slug).status_code, 404)
        self.assertEqual(self.publish().data["slug"], slug)
        self.assertEqual(self.public(slug).status_code, 200)

    def test_the_link_can_be_chosen_but_must_be_valid_and_free(self):
        self.assertEqual(self.save({}, revision=0, slug="sokha-and-dara").data["slug"], "sokha-and-dara")
        for bad in ("Has Spaces", "ab", "admin", "-dash-"):
            with self.subTest(slug=bad):
                self.assertEqual(self.save(slug=bad).status_code, 400)
        other = Event.objects.create(name="Other", date="2026-12-13", created_by=self.owner, client=self.org)
        EInvite.objects.create(event=other, slug="taken-link")
        self.assertEqual(self.save(slug="taken-link").status_code, 400)

    # The public page

    def test_the_public_page_has_the_event_date_and_venue_and_nothing_private(self):
        self.save({}, revision=0)
        slug = self.publish().data["slug"]
        data = self.public(slug).data
        # Of the event, only its date and venue (the card's own date, and its place without a programme).
        self.assertEqual(data["event"], {"date": "2026-12-12", "venue": "Sokha Hotel"})
        body = str(data)
        for private in ("Private Guest", "012 345 678", "owner", "Planner Co"):
            self.assertNotIn(private, body)
        for key in ("revision", "slug", "draft", "published"):
            self.assertNotIn(key, data)

    def test_the_public_page_may_be_cached_briefly(self):
        self.save({}, revision=0)
        slug = self.publish().data["slug"]
        self.assertIn("max-age=60", self.public(slug)["Cache-Control"])

    def test_drafts_and_unknown_links_are_not_found(self):
        self.save({}, revision=0, slug="still-a-draft")
        self.assertEqual(self.public("still-a-draft").status_code, 404)
        self.assertEqual(self.public("no-such-invite").status_code, 404)

    def test_the_public_page_ignores_a_bad_login_token(self):
        self.save({}, revision=0)
        slug = self.publish().data["slug"]
        self.client.force_authenticate(None)
        self.client.credentials(HTTP_AUTHORIZATION="Bearer not-a-real-token")
        self.assertEqual(self.client.get(reverse("public-invite", args=[slug])).status_code, 200)

    # Pictures

    def test_pictures_upload_and_appear_on_the_public_page_once_used(self):
        image_id = self.upload().data["id"]
        self.save({"content": {"gallery": [image_id], "hero_photo": image_id}}, revision=0)
        slug = self.publish().data["slug"]
        images = self.public(slug).data["images"]
        self.assertEqual(list(images), [str(image_id)])
        self.assertIn("/media/invites/", images[str(image_id)])

    def test_only_real_pictures_of_limited_size_are_accepted(self):
        self.assertEqual(self.upload(b"<html>not an image</html>", "x.png").status_code, 400)
        self.assertEqual(self.upload(PNG + b"\x00" * (5 * 1024 * 1024), "big.png").status_code, 400)
        self.assertEqual(self.upload().status_code, 201)

    def test_pictures_no_longer_used_are_removed_with_their_files(self):
        used, unused = self.upload().data["id"], self.upload().data["id"]
        unused_file = InviteImage.objects.get(pk=unused).file
        path = unused_file.path
        InviteImage.objects.filter(pk=unused).update(created_at=timezone.now() - timedelta(days=2))
        self.save({"content": {"gallery": [used]}})
        self.assertEqual(list(InviteImage.objects.values_list("id", flat=True)), [used])
        self.assertFalse(unused_file.storage.exists(path))

    # Music and older designs

    def upload_song(self, content, name="song.mp3"):
        return self.client.post(
            reverse("invite-audio", args=[self.event.pk]), {"audio": SimpleUploadedFile(name, content)}, format="multipart",
        )

    def test_a_song_uploads_and_plays_on_the_public_page_once_chosen(self):
        song = self.upload_song(b"ID3" + b"\x00" * 64)
        self.assertEqual(song.status_code, 201)
        song_id = song.data["id"]
        # A song is not a picture, and a picture is not a song.
        self.assertEqual(self.save({"content": {"hero_photo": song_id}}, revision=0).status_code, 400)
        self.assertEqual(self.save({"audio": {"music": "upload", "music_file": song_id}}, revision=0).status_code, 200)
        slug = self.publish().data["slug"]
        data = self.public(slug).data
        self.assertEqual(data["audio"]["music_file"], song_id)
        self.assertTrue(data["images"][str(song_id)].endswith(".mp3"))

    def test_only_real_songs_of_limited_size_are_accepted(self):
        self.assertEqual(self.upload_song(PNG, "fake.mp3").status_code, 400)
        self.assertEqual(self.upload_song(b"ID3" + b"\x00" * (12 * 1024 * 1024), "big.mp3").status_code, 400)
        for content, ext in [(b"OggS" + b"\x00" * 32, "ogg"), (b"\x00\x00\x00\x20ftypM4A " + b"\x00" * 32, "m4a"), (b"RIFF\x00\x00\x00\x00WAVE" + b"\x00" * 32, "wav")]:
            with self.subTest(ext=ext):
                res = self.upload_song(content, f"song.{ext}")
                self.assertEqual(res.status_code, 201)
                self.assertTrue(res.data["url"].endswith(f".{ext}"))

    def test_a_design_from_before_bilingual_text_is_read_in_the_new_shape(self):
        old = {"version": 1, "content": {"language": "en", "title": "Old title", "partner1": "Sokha", "venue": "Old hall", "date": "2026-01-01"}}
        EInvite.objects.create(event=self.event, slug="old-design", draft=old, published=old, revision=1)
        draft = self.client.get(self.url).data["draft"]
        self.assertEqual(draft["content"]["text"]["en"]["title"], "Old title")
        public = self.public("old-design").data
        self.assertEqual(public["content"]["text"]["en"]["title"], "Old title")
        # Fields the editor no longer has (date, venue: the programme holds those now) are dropped.
        self.assertNotIn("venue", public["content"]["text"]["en"])
        self.assertNotIn("date", public["content"])
        self.assertEqual(public["event"]["venue"], "Sokha Hotel")
        # Saving it stores the new shape, every field filled in.
        saved = self.save(draft, revision=1).data["draft"]
        self.assertEqual(saved["version"], 2)
        self.assertEqual(saved["content"]["text"]["en"]["title"], "Old title")
        self.assertEqual(saved["content"]["text"]["km"]["title"], "")

    # The programme

    def test_the_programme_has_parts_each_with_its_place_map_and_moments(self):
        timeline = [
            {
                "date": "2026-12-12", "maps_url": "https://maps.app.goo.gl/home",
                "text": {"en": {"title": " Morning ", "place": "Bride's home"}, "km": {"title": "ពេលព្រឹក"}},
                "items": [
                    {"time": "06:30", "text": {"en": {"title": "Guests arrive"}}},
                    {"time": "07:00", "text": {"en": {"title": "Start"}}, "extra": 1},
                ],
            },
            {"text": {"en": {"title": "Evening"}}, "items": [{"time": "17:00", "text": {"en": {"title": "Guests arrive"}}}]},
        ]
        res = self.save({"content": {"timeline": timeline}}, revision=0)
        self.assertEqual(res.status_code, 200)
        morning, evening = res.data["draft"]["content"]["timeline"]
        self.assertEqual(
            {k: morning[k] for k in ("date", "maps_url", "text")},
            {
                "date": "2026-12-12", "maps_url": "https://maps.app.goo.gl/home",
                "text": {"km": {"title": "ពេលព្រឹក", "place": "", "address": ""}, "en": {"title": "Morning", "place": "Bride's home", "address": ""}},
            },
        )
        self.assertEqual(morning["items"][1], {"time": "07:00", "text": {"km": {"title": ""}, "en": {"title": "Start"}}})
        self.assertEqual((evening["date"], evening["maps_url"], len(evening["items"])), ("", "", 1))
        slug = self.publish().data["slug"]
        self.assertEqual(len(self.public(slug).data["content"]["timeline"][0]["items"]), 2)

    def test_programme_parts_and_moments_are_checked(self):
        cases = [
            ({"content": {"timeline": [{"maps_url": "ftp://x"}]}}, "content.timeline.0.maps_url"),
            ({"content": {"timeline": [{"date": "tomorrow"}]}}, "content.timeline.0.date"),
            ({"content": {"timeline": [{}, {"items": [{"time": "7pm"}]}]}}, "content.timeline.1.items.0.time"),
            ({"content": {"timeline": [{"items": [{"text": {"en": {"title": "x" * 161}}}]}]}}, "content.timeline.0.items.0.text.en.title"),
            ({"content": {"timeline": [{}] * 11}}, "content.timeline"),
            ({"content": {"timeline": [{"items": [{}] * 31}]}}, "content.timeline.0.items"),
        ]
        for draft, field in cases:
            with self.subTest(field=field):
                res = self.save(draft, revision=0)
                self.assertEqual(res.status_code, 400)
                self.assertIn(field, res.data)

    # Bank QR codes

    def test_up_to_two_bank_qr_codes_with_labels(self):
        aba, acleda, third = (self.upload().data["id"] for _ in range(3))
        qrs = [{"image": aba, "label": " ABA · Sokha "}, {"image": acleda}]
        res = self.save({"content": {"bank_qrs": qrs}}, revision=0)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["draft"]["content"]["bank_qrs"], [{"image": aba, "label": "ABA · Sokha"}, {"image": acleda, "label": ""}])
        slug = self.publish().data["slug"]
        public = self.public(slug).data
        self.assertEqual(len(public["content"]["bank_qrs"]), 2)
        self.assertEqual(set(public["images"]), {str(aba), str(acleda)})  # their pictures are sent along
        self.assertEqual(self.save({"content": {"bank_qrs": [{"image": aba}, {"image": acleda}, {"image": third}]}}).status_code, 400)

    def test_a_bank_qr_code_must_be_one_of_the_invite_s_pictures(self):
        song = self.client.post(
            reverse("invite-audio", args=[self.event.pk]), {"audio": SimpleUploadedFile("s.mp3", b"ID3" + b"\x00" * 64)}, format="multipart",
        ).data["id"]
        for image in (999, song, None, "1"):
            with self.subTest(image=image):
                res = self.save({"content": {"bank_qrs": [{"image": image}]}}, revision=0)
                self.assertEqual(res.status_code, 400)
                self.assertIn("content.bank_qrs.0.image", res.data)
