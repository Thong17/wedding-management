"""The e-invite design: its options, defaults and validation.

Mirrored by frontend/src/invite/config.ts (same keys, option lists and defaults). A design is

    {"version": 1, "template": "classic", "design": {...}, "content": {...}, "animation": {...}}

`clean_config` turns whatever an editor sends into a complete, valid design: unknown keys are dropped,
missing ones get their default, and invalid values raise a ValidationError naming the field.
"""

import re
from datetime import date, time

from rest_framework.exceptions import ValidationError

VERSION = 1
TEMPLATES = ("classic",)
# Font pairings (names / text). Each also covers Khmer script.
FONTS = ("classic", "romantic", "modern", "khmer-royal", "khmer-elegant")
CARD_STYLES = ("framed", "ornate", "minimal")
OPENING_STYLES = ("gatefold", "envelope", "fade")
EMBLEMS = ("seal", "monogram", "image")
LANGUAGES = ("km", "en")
MAX_GALLERY = 12

_COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")


def _color(value, field):
    if not isinstance(value, str) or not _COLOR.match(value):
        raise ValidationError({field: "Use a color like #7a1f2b."})
    return value.lower()


def _choice(options):
    def check(value, field):
        if value not in options:
            raise ValidationError({field: f"Choose one of: {', '.join(options)}."})
        return value

    return check


def _bool(value, field):
    if not isinstance(value, bool):
        raise ValidationError({field: "Must be true or false."})
    return value


def _text(max_length):
    def check(value, field):
        if value is None:
            return ""
        if not isinstance(value, str):
            raise ValidationError({field: "Must be text."})
        value = value.strip()
        if len(value) > max_length:
            raise ValidationError({field: f"At most {max_length} characters."})
        return value

    return check


def _date(value, field):
    """Blank means the event's own date."""
    if value in (None, ""):
        return ""
    try:
        return date.fromisoformat(value).isoformat()
    except (TypeError, ValueError):
        raise ValidationError({field: "Use a date like 2026-12-31."})


def _time(value, field):
    if value in (None, ""):
        return ""
    try:
        return time.fromisoformat(value).strftime("%H:%M")
    except (TypeError, ValueError):
        raise ValidationError({field: "Use a time like 17:30."})


def _url(value, field):
    value = _text(1000)(value, field)
    if value and not re.match(r"^https?://[^\s]+$", value, re.IGNORECASE):
        raise ValidationError({field: "Paste a full link starting with https://."})
    return value


# Section → key → (default, validator). Image fields hold InviteImage ids and are checked separately.
SCHEMA = {
    "design": {
        "background": ("#fbf6ee", _color),
        "text_color": ("#4a1d27", _color),
        "accent": ("#c9a14a", _color),
        "font": ("classic", _choice(FONTS)),
        "card_style": ("framed", _choice(CARD_STYLES)),
        "gold_corners": (True, _bool),
        "gold_border": (True, _bool),
        "gold_dividers": (True, _bool),
        "sparkles": (True, _bool),
    },
    "content": {
        "language": ("km", _choice(LANGUAGES)),
        "greeting": ("", _text(200)),
        "title": ("", _text(120)),
        "partner1": ("", _text(80)),
        "partner2": ("", _text(80)),
        "date": ("", _date),
        "time": ("", _time),
        "venue": ("", _text(255)),
        "address": ("", _text(300)),
        "message": ("", _text(2000)),
        "maps_url": ("", _url),
    },
    "animation": {
        "enabled": (True, _bool),
        "style": ("gatefold", _choice(OPENING_STYLES)),
        "cover_color": ("#6e1423", _color),
        "emblem": ("monogram", _choice(EMBLEMS)),
        "particles": (True, _bool),
    },
}
# Image fields: section → key → many (a list) or one.
IMAGE_FIELDS = {
    "content": {"hero_photo": False, "gallery": True},
    "animation": {"cover_image": False, "emblem_image": False},
}


def default_config(event=None):
    """A complete design with every default; couple names suggested from the event name."""
    config = {"version": VERSION, "template": TEMPLATES[0]}
    for section, fields in SCHEMA.items():
        config[section] = {key: default for key, (default, _) in fields.items()}
    for section, fields in IMAGE_FIELDS.items():
        for key, many in fields.items():
            config[section][key] = [] if many else None
    if event is not None:
        first, second = _split_names(event.name)
        config["content"]["partner1"], config["content"]["partner2"] = first, second
    return config


def _split_names(name):
    """"Sokha & Dara" → ("Sokha", "Dara"); anything else stays whole as the first name."""
    parts = re.split(r"\s*(?:&|\+| and | និង )\s*", name or "", maxsplit=1)
    if len(parts) == 2 and parts[0] and parts[1]:
        return parts[0].strip()[:80], parts[1].strip()[:80]
    return (name or "").strip()[:80], ""


def clean_config(data, image_ids, event=None):
    """A complete, valid design from submitted `data`. `image_ids`: the ids of this invite's pictures.
    Fields left out get their defaults (with `event`, the couple's names suggested from its name)."""
    if not isinstance(data, dict):
        raise ValidationError({"draft": "Send the design as an object."})
    config = default_config(event)
    template = data.get("template", TEMPLATES[0])
    config["template"] = _choice(TEMPLATES)(template, "template")
    for section, fields in SCHEMA.items():
        given = data.get(section) or {}
        if not isinstance(given, dict):
            raise ValidationError({section: "Must be an object."})
        for key, (default, check) in fields.items():
            if key in given:
                config[section][key] = check(given[key], f"{section}.{key}")
    for section, fields in IMAGE_FIELDS.items():
        given = data.get(section) or {}
        for key, many in fields.items():
            field = f"{section}.{key}"
            value = given.get(key)
            if many:
                value = value or []
                if not isinstance(value, list) or not all(isinstance(v, int) for v in value):
                    raise ValidationError({field: "Must be a list of picture ids."})
                if len(value) > MAX_GALLERY:
                    raise ValidationError({field: f"At most {MAX_GALLERY} photos."})
                if any(v not in image_ids for v in value):
                    raise ValidationError({field: "Unknown picture."})
                config[section][key] = list(dict.fromkeys(value))  # no duplicates, order kept
            else:
                if value is not None and (not isinstance(value, int) or value not in image_ids):
                    raise ValidationError({field: "Unknown picture."})
                config[section][key] = value
    return config


def image_ids_in(config):
    """Every picture id a design uses."""
    ids = set()
    for section, fields in IMAGE_FIELDS.items():
        for key, many in fields.items():
            value = (config or {}).get(section, {}).get(key)
            if many:
                ids.update(value or [])
            elif value is not None:
                ids.add(value)
    return ids
