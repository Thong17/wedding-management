"""Upload storage. Which backend is used is set in settings.STORAGES (local disk or S3 / MinIO)."""

import mimetypes

from django.conf import settings
from django.core.files.storage import storages


def private_storage():
    """Client documents. A callable, so the backend is picked from settings when the app starts."""
    return storages["private"]


try:
    from storages.backends.s3 import S3Storage
except ImportError:  # django-storages is only installed in production (requirements-prod.txt)
    S3Storage = None

if S3Storage is not None:

    class PublicMediaStorage(S3Storage):
        """Public uploads in the bucket, linked as /media/<key> on our own domain.

        Caddy forwards /media/* to the bucket, so links look the same as with local files and the
        app's offline cache keeps working; browsers never talk to MinIO directly.
        """

        querystring_auth = False

        def url(self, name, parameters=None, expire=None, http_method=None):
            return f"{settings.MEDIA_URL}{name}"

        def get_object_parameters(self, name):
            # Set the type from the (already content-checked) extension, never from what the upload
            # claims, so a public object can't be served as e.g. HTML.
            params = super().get_object_parameters(name)
            params["ContentType"] = mimetypes.guess_type(name)[0] or "application/octet-stream"
            return params
