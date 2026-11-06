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


def audio_extension(upload):
    """The extension for an uploaded MP3, M4A/AAC, OGG or WAV song, judged by its content; None otherwise."""
    head = upload.read(12)
    upload.seek(0)
    if head[:3] == b"ID3" or (len(head) > 1 and head[0] == 0xFF and head[1] & 0xE0 == 0xE0 and head[1] & 0x06):
        return "mp3"  # with an ID3 tag, or starting straight with an MPEG audio frame
    if head[4:8] == b"ftyp":
        return "m4a"
    if head[:4] == b"OggS":
        return "ogg"
    if head[:4] == b"RIFF" and head[8:12] == b"WAVE":
        return "wav"
    return None
