from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.utils import timezone
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from events import access

from .models import Profile
from .uploads import image_extension

User = get_user_model()

AVATAR_MAX_BYTES = 2 * 1024 * 1024


@api_view(["GET"])
@permission_classes([AllowAny])
def health(request):
    """Cheap reachability probe; `navigator.onLine` alone does not prove the API is up."""
    return Response({"status": "ok", "time": timezone.now().isoformat()})


def username_errors(username, user=None):
    """Messages for an invalid or taken username (case-insensitive), or None. `user` is the one being renamed."""
    field = User._meta.get_field("username")
    try:
        field.clean(username, user)
    except ValidationError as exc:
        return exc.messages
    # Case-insensitive, so "Sokha" and "sokha" can't both exist and confuse sign-in.
    taken = User.objects.filter(username__iexact=username)
    if user is not None:
        taken = taken.exclude(pk=user.pk)
    return ["That username is already taken."] if taken.exists() else None


def avatar_url(request, user):
    profile = getattr(user, "profile", None)
    return request.build_absolute_uri(profile.avatar.url) if profile and profile.avatar else None


def _user_payload(request, user):
    profile = access.profile_of(user)
    client = profile.client
    return {
        "id": user.id,
        "username": user.username,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "avatar_url": avatar_url(request, user),
        "user_type": Profile.UserType.PLATFORM_ADMIN if access.is_platform_admin(user) else profile.user_type,
        "client": {"id": client.id, "business_name": client.business_name} if client else None,
        # Why the login is locked ('suspended' / 'trial_ended'), or null; the app shows a lock screen.
        "lock_reason": access.lock_reason(user),
        # When access ends: the client's trial end, or a standalone customer's own date.
        "access_ends_at": (
            (client.trial_ends_at if client.status == client.Status.TRIAL else None) if client else profile.trial_ends_at
        ),
    }


@api_view(["GET", "PATCH"])
@parser_classes([JSONParser, MultiPartParser, FormParser])
@permission_classes([IsAuthenticated, access.NotLockedUnlessSafe])
def me(request):
    """
    GET the signed-in user (allowed while locked, to show the lock screen). PATCH (JSON or multipart)
    updates the profile: `username`, `avatar` (an image file) and `remove_avatar` ("true" clears it).
    """
    user = request.user
    if request.method == "GET":
        return Response(_user_payload(request, user))

    errors = {}
    username = request.data.get("username")
    if username is not None:
        username = str(username).strip()
        problems = username_errors(username, user)
        if problems:
            errors["username"] = problems

    upload = request.FILES.get("avatar")
    ext = None
    if upload is not None:
        if upload.size > AVATAR_MAX_BYTES:
            errors["avatar"] = ["The picture must be 2 MB or smaller."]
        else:
            ext = image_extension(upload)
            if ext is None:
                errors["avatar"] = ["Upload a JPEG, PNG, WebP or GIF picture."]

    if errors:
        return Response(errors, status=400)

    if username is not None and username != user.username:
        user.username = username
        user.save(update_fields=["username"])

    remove = str(request.data.get("remove_avatar", "")).lower() in ("1", "true", "yes")
    if upload is not None or remove:
        profile = access.profile_of(user)
        if profile.avatar:
            profile.avatar.delete(save=False)
        if upload is not None:
            profile.avatar.save(f"avatar.{ext}", upload, save=False)
        profile.save()
        user.profile = profile

    return Response(_user_payload(request, user))


@api_view(["POST"])
def change_password(request):
    """POST {current_password, new_password}. The current session's tokens stay valid."""
    user = request.user
    current = request.data.get("current_password") or ""
    new = request.data.get("new_password") or ""
    if not user.check_password(current):
        return Response({"current_password": ["Your current password is not correct."]}, status=400)
    try:
        validate_password(new, user)
    except ValidationError as exc:
        return Response({"new_password": exc.messages}, status=400)
    user.set_password(new)
    user.save(update_fields=["password"])
    return Response(status=204)
