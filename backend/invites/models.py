import uuid

from django.conf import settings
from django.db import models
from django.db.models.signals import post_delete
from django.dispatch import receiver


class EInvite(models.Model):
    """An event's digital invitation: the draft being designed and the snapshot guests see.

    `draft` and `published` hold the whole design as JSON ({"version", "template", "design", "content",
    "animation"}; see invites/config.py), so new templates and options need no migrations. Guests only
    ever see `published`: saving the draft changes nothing for them until it is published again.
    """

    event = models.OneToOneField("events.Event", on_delete=models.CASCADE, related_name="invite")
    # The public link is /e-invite/<slug>. Chosen on first publish unless set before.
    slug = models.SlugField(max_length=60, unique=True, null=True, blank=True)
    draft = models.JSONField(default=dict)
    published = models.JSONField(null=True, blank=True)
    published_at = models.DateTimeField(null=True, blank=True)
    # Bumped on every save and publish; editors send the one they loaded, so two people can't overwrite
    # each other's changes unknowingly.
    revision = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")

    def __str__(self):
        return f"Invite for {self.event}"

    @property
    def status(self):
        return "published" if self.published is not None else "draft"

    @property
    def has_changes(self):
        """Published, and the draft has been changed since."""
        return self.published is not None and self.published != self.draft


def invite_image_path(instance, filename):
    ext = filename.rsplit(".", 1)[-1].lower()
    return f"invites/{instance.invite.event_id}/{uuid.uuid4().hex}.{ext}"


class InviteImage(models.Model):
    """A picture for an invite (photo, cover, emblem), on the public upload storage.

    The design refers to pictures by id. Files are never kept in the database.
    """

    invite = models.ForeignKey(EInvite, on_delete=models.CASCADE, related_name="images")
    file = models.FileField(upload_to=invite_image_path)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["id"]

    def __str__(self):
        return self.file.name


@receiver(post_delete, sender=InviteImage)
def _delete_image_file(sender, instance, **kwargs):
    """Remove the stored file too, also when the invite or its event is deleted (cascade)."""
    if instance.file:
        instance.file.delete(save=False)
