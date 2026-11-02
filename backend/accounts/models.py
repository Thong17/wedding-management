import uuid

from django.conf import settings
from django.db import models


def avatar_path(instance, filename):
    # A fresh name on every upload, so browsers and the offline cache never show a stale picture.
    ext = filename.rsplit(".", 1)[-1].lower()
    return f"avatars/{instance.user_id}-{uuid.uuid4().hex[:12]}.{ext}"


class Profile(models.Model):
    """Per-user extras that Django's built-in User has no field for."""

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="profile")
    avatar = models.FileField(upload_to=avatar_path, blank=True)

    def __str__(self):
        return f"Profile of {self.user}"
