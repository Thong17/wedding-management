"""Validation for an event's invitation QR base (mirrors frontend/src/offline/inviteQr.ts)."""

from urllib.parse import urlparse


def crc16(text: str) -> str:
    """CRC-16/CCITT-FALSE over UTF-8 bytes, as EMVCo (KHQR) tag 63 requires."""
    crc = 0xFFFF
    for byte in text.encode("utf-8"):
        crc ^= byte << 8
        for _ in range(8):
            crc = ((crc << 1) ^ 0x1021) & 0xFFFF if crc & 0x8000 else (crc << 1) & 0xFFFF
    return f"{crc:04X}"


def is_valid_khqr(text: str) -> bool:
    if not text.startswith("000201") or len(text) < 14 or text[-8:-4] != "6304":
        return False
    return crc16(text[:-4]) == text[-4:].upper()


def invite_qr_error(value: str):
    """None if `value` is blank, an http(s) link, or a KHQR with a valid checksum; else a message."""
    value = value.strip()
    if not value:
        return None
    if value.startswith("000201"):
        return None if is_valid_khqr(value) else "This bank QR could not be verified (its checksum doesn't match)."
    parsed = urlparse(value)
    if parsed.scheme in ("http", "https") and parsed.netloc:
        return None
    return "Enter a web link starting with https:// (e.g. a Google Maps link) or a bank KHQR code."
