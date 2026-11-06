import re
import secrets
from datetime import timedelta

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.text import slugify
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from accounts.uploads import audio_extension, image_extension
from events import access
from events.models import Event, Permission

from .config import LANGUAGES, clean_config, default_config, file_ids_in, upgrade
from .models import EInvite, InviteImage

IMAGE_MAX_BYTES = 5 * 1024 * 1024
AUDIO_MAX_BYTES = 12 * 1024 * 1024
# Files (pictures and songs) per invite, used or not (uploads not yet saved into the design count too).
MAX_IMAGES = 40
# Unused pictures are removed once this old (younger ones may belong to a design not saved yet).
UNUSED_IMAGE_GRACE = timedelta(days=1)
SLUG_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
RESERVED_SLUGS = {"admin", "api", "media", "static", "new", "preview", "e-invite", "invite"}


def _event_for_editing(request, event_pk):
    event = get_object_or_404(Event, pk=event_pk)
    access.require(request.user, event, permission=Permission.INVITE_EDIT)
    return event


def _image_urls(request, invite, ids=None):
    images = invite.images.all() if ids is None else invite.images.filter(id__in=ids)
    return {str(img.id): request.build_absolute_uri(img.file.url) for img in images}


def _editor_payload(request, event, invite):
    """What the editor needs: the draft, its status and the invite's pictures."""
    if invite is None:
        return {
            "slug": None, "status": "draft", "has_changes": False, "published_at": None, "revision": 0,
            "draft": default_config(event), "images": {},
        }
    return {
        "slug": invite.slug,
        "status": invite.status,
        "has_changes": invite.has_changes,
        "published_at": invite.published_at,
        "revision": invite.revision,
        "draft": upgrade(invite.draft),
        "images": _image_urls(request, invite),
    }


def _clean_slug(value, invite):
    slug = (value or "").strip().lower()
    if not SLUG_PATTERN.match(slug) or not 3 <= len(slug) <= 60:
        raise ValidationError({"slug": "Use 3–60 lower-case letters, numbers and dashes, e.g. sokha-dara."})
    if slug in RESERVED_SLUGS:
        raise ValidationError({"slug": "That link is reserved. Choose another."})
    if EInvite.objects.filter(slug=slug).exclude(pk=invite.pk if invite else None).exists():
        raise ValidationError({"slug": "That link is already taken. Choose another."})
    return slug


def _new_slug(config):
    """From the couple's names (Latin letters only, so the English ones first) plus a random tail,
    e.g. sokha-dara-7k2p."""
    text = upgrade(config).get("content", {}).get("text", {})
    base = ""
    for lang in ("en", *LANGUAGES):
        words = text.get(lang) or {}
        base = slugify(f"{words.get('partner1', '')} {words.get('partner2', '')}")[:40].strip("-")
        if base:
            break
    base = base or "wedding"
    while True:
        slug = f"{base}-{secrets.token_hex(2)}"
        if not EInvite.objects.filter(slug=slug).exists():
            return slug


def _remove_unused_images(invite):
    """Delete pictures neither the draft nor the published design uses, past the grace period."""
    used = file_ids_in(invite.draft) | file_ids_in(invite.published)
    stale = invite.images.exclude(id__in=used).filter(created_at__lt=timezone.now() - UNUSED_IMAGE_GRACE)
    for image in stale:
        image.delete()  # the file goes too (models._delete_image_file)


def _check_revision(request, invite):
    """The editor must send the revision it loaded; someone else saved meanwhile → 409 with theirs."""
    sent = request.data.get("revision")
    current = invite.revision if invite else 0
    if sent != current:
        return Response(
            {"detail": "Someone else changed this invitation.", "current": None},
            status=status.HTTP_409_CONFLICT,
        )
    return None


class InviteView(APIView):
    """GET → the editor's view of the event's invite (defaults if none yet).
    PUT {"draft", "slug"?, "revision"} → save the draft. Guests see nothing of it until it is published."""

    def get(self, request, event_pk):
        event = _event_for_editing(request, event_pk)
        invite = EInvite.objects.filter(event=event).first()
        return Response(_editor_payload(request, event, invite))

    @transaction.atomic
    def put(self, request, event_pk):
        event = _event_for_editing(request, event_pk)
        invite = EInvite.objects.select_for_update().filter(event=event).first()
        conflict = _check_revision(request, invite)
        if conflict:
            conflict.data["current"] = _editor_payload(request, event, invite)
            return conflict
        if invite is None:
            invite = EInvite(event=event)
        files = dict(invite.images.values_list("id", "kind")) if invite.pk else {}
        invite.draft = clean_config(request.data.get("draft"), files, event)
        if request.data.get("slug"):
            invite.slug = _clean_slug(request.data["slug"], invite)
        invite.revision += 1
        invite.updated_by = request.user
        invite.save()
        _remove_unused_images(invite)
        return Response(_editor_payload(request, event, invite))


class InvitePublishView(APIView):
    """POST {"revision"} → make the saved draft what guests see (choosing the link the first time)."""

    @transaction.atomic
    def post(self, request, event_pk):
        event = _event_for_editing(request, event_pk)
        invite = EInvite.objects.select_for_update().filter(event=event).first()
        if invite is None:
            raise ValidationError({"detail": "Save the invitation before publishing it."})
        conflict = _check_revision(request, invite)
        if conflict:
            conflict.data["current"] = _editor_payload(request, event, invite)
            return conflict
        if not invite.slug:
            invite.slug = _new_slug(invite.draft)
        invite.published = invite.draft
        invite.published_at = timezone.now()
        invite.revision += 1
        invite.updated_by = request.user
        invite.save()
        _remove_unused_images(invite)
        return Response(_editor_payload(request, event, invite))


class InviteUnpublishView(APIView):
    """POST → take the public page down. The draft and the link are kept for publishing again."""

    @transaction.atomic
    def post(self, request, event_pk):
        event = _event_for_editing(request, event_pk)
        invite = get_object_or_404(EInvite.objects.select_for_update(), event=event)
        invite.published = None
        invite.published_at = None
        invite.revision += 1
        invite.updated_by = request.user
        invite.save()
        return Response(_editor_payload(request, event, invite))


def _store_upload(request, event, upload, ext, kind, field):
    """Keep an uploaded file for the event's invite (creating the invite if needed) → 201 {"id", "url"}."""
    invite, _ = EInvite.objects.select_for_update().get_or_create(event=event, defaults={"draft": default_config(event)})
    _remove_unused_images(invite)
    if invite.images.count() >= MAX_IMAGES:
        raise ValidationError({field: f"This invitation already has {MAX_IMAGES} files. Remove some first."})
    stored = InviteImage(invite=invite, kind=kind)
    stored.file.save(f"{kind}.{ext}", upload, save=False)
    stored.save()
    return Response({"id": stored.id, "url": request.build_absolute_uri(stored.file.url)}, status=status.HTTP_201_CREATED)


class InviteImageView(APIView):
    """POST multipart {"image"} → {"id", "url"}. JPEG, PNG, WebP or GIF up to 5 MB, judged by content."""

    parser_classes = [MultiPartParser]

    @transaction.atomic
    def post(self, request, event_pk):
        event = _event_for_editing(request, event_pk)
        upload = request.FILES.get("image")
        if upload is None:
            raise ValidationError({"image": "Choose a picture."})
        if upload.size > IMAGE_MAX_BYTES:
            raise ValidationError({"image": "The picture must be 5 MB or smaller."})
        ext = image_extension(upload)
        if ext is None:
            raise ValidationError({"image": "Upload a JPEG, PNG, WebP or GIF picture."})
        return _store_upload(request, event, upload, ext, InviteImage.Kind.IMAGE, "image")


class InviteAudioView(APIView):
    """POST multipart {"audio"} → {"id", "url"}: background music. MP3, M4A/AAC, OGG or WAV up to 12 MB,
    judged by content."""

    parser_classes = [MultiPartParser]

    @transaction.atomic
    def post(self, request, event_pk):
        event = _event_for_editing(request, event_pk)
        upload = request.FILES.get("audio")
        if upload is None:
            raise ValidationError({"audio": "Choose a song."})
        if upload.size > AUDIO_MAX_BYTES:
            raise ValidationError({"audio": "The song must be 12 MB or smaller."})
        ext = audio_extension(upload)
        if ext is None:
            raise ValidationError({"audio": "Upload an MP3, M4A, OGG or WAV file."})
        return _store_upload(request, event, upload, ext, InviteImage.Kind.AUDIO, "audio")


class PublicInviteThrottle(AnonRateThrottle):
    rate = "120/minute"


class PublicInviteView(APIView):
    """GET → a published invitation, for anyone with the link (no login).

    Only the published design (in today's shape: fields older designs had are dropped), the files it
    uses, and the event's date and venue (`event`) for the card. Nothing else about the event, its
    guests or its client.
    """

    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [PublicInviteThrottle]

    def get(self, request, slug):
        invite = EInvite.objects.select_related("event").filter(slug=slug, published__isnull=False).first()
        if invite is None:
            return Response({"detail": "Invitation not found."}, status=status.HTTP_404_NOT_FOUND)
        try:
            config = clean_config(invite.published, dict(invite.images.values_list("id", "kind")), invite.event)
        except ValidationError:  # stored before a rule tightened: show it as it was
            config = upgrade(invite.published)
        response = Response({
            **config,
            "event": {"date": invite.event.date.isoformat(), "venue": invite.event.venue},
            "images": _image_urls(request, invite, file_ids_in(config)),
        })
        # Browsers may reuse it briefly (the page's early request and the app's share one download) and
        # show a stale copy while fetching a fresh one; a republish reaches guests within a minute.
        response["Cache-Control"] = "public, max-age=60, stale-while-revalidate=600"
        return response
