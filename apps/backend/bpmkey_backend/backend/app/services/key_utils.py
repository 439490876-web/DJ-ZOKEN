from __future__ import annotations

import re
from typing import Optional, Tuple

KEY_TO_CAMELOT_MAJOR = {
    "C": "8B",
    "C#": "3B",
    "DB": "3B",
    "D": "10B",
    "D#": "5B",
    "EB": "5B",
    "E": "12B",
    "F": "7B",
    "F#": "2B",
    "GB": "2B",
    "G": "9B",
    "G#": "4B",
    "AB": "4B",
    "A": "11B",
    "A#": "6B",
    "BB": "6B",
    "B": "1B",
}

KEY_TO_CAMELOT_MINOR = {
    "A": "8A",
    "A#": "3A",
    "BB": "3A",
    "B": "10A",
    "C": "5A",
    "C#": "12A",
    "DB": "12A",
    "D": "7A",
    "D#": "2A",
    "EB": "2A",
    "E": "9A",
    "F": "4A",
    "F#": "11A",
    "GB": "11A",
    "G": "6A",
    "G#": "1A",
    "AB": "1A",
}

CAMELOT_TO_KEY_TEXT = {
    "1A": "G# minor",
    "2A": "D# minor",
    "3A": "A# minor",
    "4A": "F minor",
    "5A": "C minor",
    "6A": "G minor",
    "7A": "D minor",
    "8A": "A minor",
    "9A": "E minor",
    "10A": "B minor",
    "11A": "F# minor",
    "12A": "C# minor",
    "1B": "B major",
    "2B": "F# major",
    "3B": "C# major",
    "4B": "Ab major",
    "5B": "Eb major",
    "6B": "Bb major",
    "7B": "F major",
    "8B": "C major",
    "9B": "G major",
    "10B": "D major",
    "11B": "A major",
    "12B": "E major",
}


def key_to_camelot(note: str, scale: str) -> Optional[str]:
    if not note:
        return None
    key = note.strip().upper().replace(" ", "")
    if scale == "minor":
        return KEY_TO_CAMELOT_MINOR.get(key)
    return KEY_TO_CAMELOT_MAJOR.get(key)


def camelot_to_key_text(camelot: str) -> Optional[str]:
    return CAMELOT_TO_KEY_TEXT.get(camelot.upper())


def _parse_scale(raw: str) -> Optional[str]:
    raw_lower = raw.lower()
    if "minor" in raw_lower or raw_lower.endswith("min"):
        return "minor"
    if "major" in raw_lower or raw_lower.endswith("maj"):
        return "major"
    if raw_lower.endswith("m") and not raw_lower.endswith("maj"):
        return "minor"
    return "major"


def _parse_note(raw: str) -> Optional[str]:
    match = re.search(r"([A-Ga-g])\s*([#b]?)", raw)
    if not match:
        return None
    return f"{match.group(1)}{match.group(2)}".upper()


def parse_key_tag(raw: Optional[str]) -> Tuple[Optional[str], Optional[str]]:
    if not raw:
        return None, None
    cleaned = raw.strip()
    if not cleaned:
        return None, None

    camelot_match = re.fullmatch(r"\d{1,2}[ABab]", cleaned)
    if camelot_match:
        camelot = cleaned.upper()
        key_text = camelot_to_key_text(camelot)
        return key_text, camelot

    note = _parse_note(cleaned)
    if not note:
        return None, None
    scale = _parse_scale(cleaned)
    key_text = f"{note} {scale}"
    camelot = key_to_camelot(note, scale)
    return key_text, camelot
