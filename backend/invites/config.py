"""The e-invite design: its options, defaults and validation.

Mirrored by frontend/src/invite/config.ts (same keys, option lists and defaults). A design is

    {"version": 2, "template": "classic", "design": {...}, "content": {...}, "animation": {...}, "audio": {...}}

The invitation's words are written per language, `content.text = {"km": {...}, "en": {...}}`, so guests
can switch between Khmer and English; `content.language` is the one it opens in. Version 1 designs
(one language, the words directly in `content`) are converted when read.

`clean_config` turns whatever an editor sends into a complete, valid design: unknown keys are dropped,
missing ones get their default, and invalid values raise a ValidationError naming the field.
"""

import re
from copy import deepcopy
from datetime import date, time

from rest_framework.exceptions import ValidationError

VERSION = 2
TEMPLATES = ("classic",)
# Font pairings (names / text). Each also covers Khmer script.
FONTS = ("classic", "romantic", "modern", "khmer-royal", "khmer-elegant")
CARD_STYLES = ("framed", "ornate", "minimal")
# How the programme's moments are drawn: a winding road, or a straight line down the middle.
ROUTE_STYLES = ("road", "line")
# Where the ornate gold frame (corner flourishes, a diamond) is used. Areas left out get a plain frame
# (programme, maps, gifts) or none (hero photo, names, gallery).
ORNATE_AREAS = ("hero", "names", "programme", "maps", "gifts", "gallery")
# The ornate frame's look.
ORNATE_STYLES = ("royal", "khmer", "chinese", "minimal", "modern")
OPENING_STYLES = ("gatefold", "envelope", "fade")
EMBLEMS = ("seal", "monogram", "image")
LANGUAGES = ("km", "en")
# Background music: tunes the browser plays itself (no files), the organizer's own song, or none.
MUSIC = ("musicbox", "harp", "upload", "none")
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


def _choices(options):
    """A list of some of `options`, each at most once, kept in the options' order."""

    def check(value, field):
        if not isinstance(value, list) or any(v not in options for v in value):
            raise ValidationError({field: f"Choose from: {', '.join(options)}."})
        return [o for o in options if o in value]

    return check


def _bool(value, field):
    if not isinstance(value, bool):
        raise ValidationError({field: "Must be true or false."})
    return value


def _number(low, high):
    def check(value, field):
        if isinstance(value, bool) or not isinstance(value, int) or not low <= value <= high:
            raise ValidationError({field: f"A whole number from {low} to {high}."})
        return value

    return check


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


# The invitation's words, written once per language (content.text.km / content.text.en). Dates, times,
# places and maps live in the programme (content.timeline); the card's own date is the event's.
TEXT_FIELDS = {
    "greeting": _text(200),
    "title": _text(120),
    "partner1": _text(80),
    "partner2": _text(80),
    "message": _text(2000),
}

# The programme (content.timeline): parts of the day, e.g. the morning ceremony at the bride's home and
# the evening reception at a hotel. Each part has its own date, place and map, and its moments in order
# (6:30 guests arrive, 7:00 the procession starts, …).
MAX_PARTS = 10
MAX_MOMENTS = 30
PART_TEXT = {"title": _text(120), "place": _text(200), "address": _text(300)}
PART_FIELDS = {"date": _date, "maps_url": _url}
MOMENT_TEXT = {"title": _text(160)}
MOMENT_FIELDS = {"time": _time}


def _object(value, field):
    if value is None:
        return {}
    if not isinstance(value, dict):
        raise ValidationError({field: "Must be an object."})
    return value


def _list(value, field, most):
    if value in (None, ""):
        return []
    if not isinstance(value, list):
        raise ValidationError({field: "Must be a list."})
    if len(value) > most:
        raise ValidationError({field: f"At most {most} items."})
    return value


def _with_words(given, where, fields, text_fields):
    """One programme entry: its own fields, and its words in each language."""
    given = _object(given, where)
    entry = {key: check(given.get(key), f"{where}.{key}") for key, check in fields.items()}
    text = _object(given.get("text"), f"{where}.text")
    entry["text"] = {}
    for lang in LANGUAGES:
        words = _object(text.get(lang), f"{where}.text.{lang}")
        entry["text"][lang] = {key: check(words.get(key), f"{where}.text.{lang}.{key}") for key, check in text_fields.items()}
    return entry


def _timeline(value, field):
    parts = []
    for i, given in enumerate(_list(value, field, MAX_PARTS)):
        where = f"{field}.{i}"
        part = _with_words(given, where, PART_FIELDS, PART_TEXT)
        moments = _list(_object(given, where).get("items"), f"{where}.items", MAX_MOMENTS)
        part["items"] = [_with_words(m, f"{where}.items.{j}", MOMENT_FIELDS, MOMENT_TEXT) for j, m in enumerate(moments)]
        parts.append(part)
    return parts


# Section → key → (default, validator). File fields hold InviteImage ids and are checked separately.
SCHEMA = {
    "design": {
        "background": ("#fbf6ee", _color),
        "text_color": ("#4a1d27", _color),
        "accent": ("#c9a14a", _color),
        "font": ("classic", _choice(FONTS)),
        "card_style": ("framed", _choice(CARD_STYLES)),
        "route_style": ("road", _choice(ROUTE_STYLES)),
        "ornate_frames": (list(ORNATE_AREAS), _choices(ORNATE_AREAS)),
        "ornate_style": ("royal", _choice(ORNATE_STYLES)),
        # The couple's names, as a percentage of their usual size (cover and card).
        "names_size": (100, _number(60, 160)),
        # Which part of the main photo shows in its arch: 0–100 % across and down (50 = centre).
        "hero_x": (50, _number(0, 100)),
        "hero_y": (50, _number(0, 100)),
        "gold_corners": (True, _bool),
        "gold_border": (True, _bool),
        "gold_dividers": (True, _bool),
        "sparkles": (True, _bool),
    },
    "content": {
        "language": ("km", _choice(LANGUAGES)),
        "timeline": ([], _timeline),
    },
    "animation": {
        "enabled": (True, _bool),
        "style": ("gatefold", _choice(OPENING_STYLES)),
        "cover_color": ("#6e1423", _color),
        "emblem": ("monogram", _choice(EMBLEMS)),
        "particles": (True, _bool),
    },
    "audio": {
        "music": ("musicbox", _choice(MUSIC)),
        "volume": (60, _number(0, 100)),
        "open_sound": (True, _bool),
    },
}
# File fields: section → key → (many: a list or one, kind of file).
FILE_FIELDS = {
    "content": {"hero_photo": (False, "image"), "gallery": (True, "image")},
    "animation": {"cover_image": (False, "image"), "emblem_image": (False, "image")},
    "audio": {"music_file": (False, "audio")},
}


def default_config(event=None):
    """A complete design with every default; couple names suggested from the event name."""
    config = {"version": VERSION, "template": TEMPLATES[0]}
    for section, fields in SCHEMA.items():
        config[section] = {key: deepcopy(default) for key, (default, _) in fields.items()}
    config["content"]["text"] = {lang: {key: "" for key in TEXT_FIELDS} for lang in LANGUAGES}
    for section, fields in FILE_FIELDS.items():
        for key, (many, _) in fields.items():
            config[section][key] = [] if many else None
    config["content"]["bank_qrs"] = []
    if event is not None:
        first, second = _split_names(event.name)
        for lang in LANGUAGES:
            config["content"]["text"][lang].update(partner1=first, partner2=second)
    return config


def _split_names(name):
    """"Sokha & Dara" → ("Sokha", "Dara"); anything else stays whole as the first name."""
    parts = re.split(r"\s*(?:&|\+| and | និង )\s*", name or "", maxsplit=1)
    if len(parts) == 2 and parts[0] and parts[1]:
        return parts[0].strip()[:80], parts[1].strip()[:80]
    return (name or "").strip()[:80], ""


def upgrade(data):
    """A version 1 design (the words directly in `content`, one language) in the version 2 shape."""
    if not isinstance(data, dict):
        return data
    content = data.get("content")
    if isinstance(content, dict) and "text" not in content and any(key in content for key in TEXT_FIELDS):
        language = content.get("language") if content.get("language") in LANGUAGES else LANGUAGES[0]
        words = {key: value for key, value in content.items() if key in TEXT_FIELDS}
        rest = {key: value for key, value in content.items() if key not in TEXT_FIELDS}
        data = {**data, "content": {**rest, "text": {language: words}}, "version": VERSION}
    return data


def clean_config(data, files, event=None):
    """A complete, valid design from submitted `data`. `files`: this invite's uploads, id → kind
    ("image" or "audio"). Fields left out get their defaults (with `event`, the couple's names
    suggested from its name)."""
    if not isinstance(data, dict):
        raise ValidationError({"draft": "Send the design as an object."})
    data = upgrade(data)
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

    text = (data.get("content") or {}).get("text") or {}
    if not isinstance(text, dict):
        raise ValidationError({"content.text": "Must be an object."})
    for lang in LANGUAGES:
        words = text.get(lang) or {}
        if not isinstance(words, dict):
            raise ValidationError({f"content.text.{lang}": "Must be an object."})
        for key, check in TEXT_FIELDS.items():
            if key in words:
                config["content"]["text"][lang][key] = check(words[key], f"content.text.{lang}.{key}")

    for section, fields in FILE_FIELDS.items():
        given = data.get(section) or {}
        for key, (many, kind) in fields.items():
            field = f"{section}.{key}"
            unknown = "Unknown picture." if kind == "image" else "Unknown song."
            value = given.get(key)
            if many:
                value = value or []
                if not isinstance(value, list) or not all(isinstance(v, int) for v in value):
                    raise ValidationError({field: "Must be a list of picture ids."})
                if len(value) > MAX_GALLERY:
                    raise ValidationError({field: f"At most {MAX_GALLERY} photos."})
                if any(files.get(v) != kind for v in value):
                    raise ValidationError({field: unknown})
                config[section][key] = list(dict.fromkeys(value))  # no duplicates, order kept
            else:
                if value is not None and (isinstance(value, bool) or not isinstance(value, int) or files.get(value) != kind):
                    raise ValidationError({field: unknown})
                config[section][key] = value

    config["content"]["bank_qrs"] = _bank_qrs((data.get("content") or {}).get("bank_qrs"), files)
    return config


# Bank QR codes for gifts (content.bank_qrs): at most two, each a picture with an optional label (the
# bank or the account name, e.g. "ABA · Sokha Chan"), shown below the message.
MAX_BANK_QRS = 2
_label = _text(80)


def _bank_qrs(value, files):
    field = "content.bank_qrs"
    entries = []
    for i, given in enumerate(_list(value, field, MAX_BANK_QRS)):
        where = f"{field}.{i}"
        given = _object(given, where)
        image = given.get("image")
        if isinstance(image, bool) or not isinstance(image, int) or files.get(image) != "image":
            raise ValidationError({f"{where}.image": "Unknown picture."})
        entries.append({"image": image, "label": _label(given.get("label"), f"{where}.label")})
    return entries


def file_ids_in(config):
    """Every upload id a design uses (pictures, bank QR codes and song)."""
    ids = set()
    config = upgrade(config) or {}
    for section, fields in FILE_FIELDS.items():
        for key, (many, _) in fields.items():
            value = config.get(section, {}).get(key)
            if many:
                ids.update(value or [])
            elif value is not None:
                ids.add(value)
    ids.update(qr.get("image") for qr in config.get("content", {}).get("bank_qrs") or [] if isinstance(qr, dict) and qr.get("image"))
    return ids
