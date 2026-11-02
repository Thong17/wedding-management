from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.utils import timezone
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .models import Profile

User = get_user_model()

AVATAR_MAX_BYTES = 2 * 1024 * 1024
# Leading bytes of the image formats we accept, mapped to the extension we store them with.
# Checked against the content, not the file name, so a renamed non-image is rejected.
AVATAR_SIGNATURES = {
    b"\xff\xd8\xff": "jpg",
    b"\x89PNG\r\n\x1a\n": "png",
    b"GIF87a": "gif",
    b"GIF89a": "gif",
}


@api_view(["GET"])
@permission_classes([AllowAny])
def health(request):
    """Cheap reachability probe; `navigator.onLine` alone does not prove the API is up."""
    return Response({"status": "ok", "time": timezone.now().isoformat()})


def _avatar_extension(upload):
    head = upload.read(12)
    upload.seek(0)
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "webp"
    for signature, ext in AVATAR_SIGNATURES.items():
        if head.startswith(signature):
            return ext
    return None


def _user_payload(request, user):
    profile = getattr(user, "profile", None)
    avatar = profile.avatar if profile else None
    return {
        "id": user.id,
        "username": user.username,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "avatar_url": request.build_absolute_uri(avatar.url) if avatar else None,
    }


@api_view(["GET", "PATCH"])
@parser_classes([JSONParser, MultiPartParser, FormParser])
def me(request):
    """
    GET the signed-in user. PATCH (JSON or multipart) updates the profile:
    `username`, `avatar` (an image file) and `remove_avatar` ("true" clears it).
    """
    user = request.user
    if request.method == "GET":
        return Response(_user_payload(request, user))

    errors = {}
    username = request.data.get("username")
    if username is not None:
        username = str(username).strip()
        field = User._meta.get_field("username")
        try:
            field.clean(username, user)
        except ValidationError as exc:
            errors["username"] = exc.messages
        else:
            # Case-insensitive, so "Sokha" and "sokha" can't both exist and confuse sign-in.
            if User.objects.filter(username__iexact=username).exclude(pk=user.pk).exists():
                errors["username"] = ["That username is already taken."]

    upload = request.FILES.get("avatar")
    ext = None
    if upload is not None:
        if upload.size > AVATAR_MAX_BYTES:
            errors["avatar"] = ["The picture must be 2 MB or smaller."]
        else:
            ext = _avatar_extension(upload)
            if ext is None:
                errors["avatar"] = ["Upload a JPEG, PNG, WebP or GIF picture."]

    if errors:
        return Response(errors, status=400)

    if username is not None and username != user.username:
        user.username = username
        user.save(update_fields=["username"])

    remove = str(request.data.get("remove_avatar", "")).lower() in ("1", "true", "yes")
    if upload is not None or remove:
        profile, _ = Profile.objects.get_or_create(user=user)
        if profile.avatar:
            profile.avatar.delete(save=False)
        if upload is not None:
            profile.avatar.save(f"avatar.{ext}", upload, save=False)
        profile.save()
        user.profile = profile

    return Response(_user_payload(request, user))
