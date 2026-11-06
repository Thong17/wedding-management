"""Checks for uploaded pictures (profile pictures, e-invite photos)."""

# Leading bytes of the image formats we accept, mapped to the extension we store them with.
# Checked against the content, not the file name, so a renamed non-image is rejected.
IMAGE_SIGNATURES = {
    b"\xff\xd8\xff": "jpg",
    b"\x89PNG\r\n\x1a\n": "png",
    b"GIF87a": "gif",
    b"GIF89a": "gif",
}


def image_extension(upload):
    """The extension for an uploaded JPEG, PNG, WebP or GIF, judged by its content; None for anything else."""
    head = upload.read(12)
    upload.seek(0)
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "webp"
    for signature, ext in IMAGE_SIGNATURES.items():
        if head.startswith(signature):
            return ext
    return None
