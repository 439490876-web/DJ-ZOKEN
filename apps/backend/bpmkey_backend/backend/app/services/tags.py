from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Optional, Tuple

from mutagen import File as MutagenFile

from .key_utils import parse_key_tag

logger = logging.getLogger("analyzer")

BPM_TAG_KEYS = [
    "tbpm",
    "bpm",
    "tempo",
    "tXXX:tbpm",
    "tXXX:bpm",
    "tXXX:tempo",
    "tXXX:serato bpm",
    "tXXX:serato_bpm",
    "tXXX:rekordbox bpm",
    "tXXX:rekordbox_bpm",
    "tXXX:track bpm",
]

KEY_TAG_KEYS = [
    "tkey",
    "key",
    "tXXX:key",
    "tXXX:initialkey",
    "tXXX:serato key",
    "tXXX:serato_key",
    "tXXX:rekordbox key",
    "tXXX:rekordbox_key",
    "tXXX:initial key",
]


@dataclass
class TagResult:
    bpm: Optional[float]
    key_text: Optional[str]
    key_camelot: Optional[str]
    raw_tags: Dict[str, str]
    warnings: list[str]
    vendor: Optional[str]


def _coerce_value(value) -> Optional[str]:
    if value is None:
        return None
    if hasattr(value, "text"):
        text = value.text
        if isinstance(text, (list, tuple)):
            return " ".join(str(item) for item in text if item is not None).strip() or None
        return str(text).strip() or None
    if isinstance(value, (list, tuple)):
        return " ".join(str(item) for item in value if item is not None).strip() or None
    return str(value).strip() or None


def _normalize_key(key: str) -> str:
    return key.lower()


def _extract_tag_map(tags) -> Dict[str, str]:
    tag_map: Dict[str, str] = {}
    for key in tags.keys():
        value = tags.get(key)
        text = _coerce_value(value)
        if text:
            tag_map[_normalize_key(key)] = text
    return tag_map


def _find_first(tag_map: Dict[str, str], keys: list[str]) -> Tuple[Optional[str], Optional[str]]:
    for key in keys:
        normalized = _normalize_key(key)
        if normalized in tag_map:
            return tag_map[normalized], key
    return None, None


def _parse_bpm(value: str) -> Optional[float]:
    try:
        bpm = float(str(value).strip())
    except Exception:
        return None
    if bpm <= 0:
        return None
    return bpm


def _detect_vendor(tag_map: Dict[str, str]) -> Optional[str]:
    for key in tag_map.keys():
        lowered = key.lower()
        if "serato" in lowered:
            return "serato"
        if "rekordbox" in lowered:
            return "rekordbox"
    return None


def extract_tags(path: Path) -> TagResult:
    warnings: list[str] = []
    logger.info("read_tags start")
    try:
        audio = MutagenFile(path)
    except Exception as exc:
        logger.exception("tag read failed: %s", exc)
        return TagResult(None, None, None, {}, ["tag_read_failed"], None)

    if audio is None or audio.tags is None:
        logger.info("read_tags end")
        return TagResult(None, None, None, {}, [], None)

    tag_map = _extract_tag_map(audio.tags)
    raw_tags: Dict[str, str] = {}
    bpm_value, bpm_key = _find_first(tag_map, BPM_TAG_KEYS)
    if bpm_key and bpm_value:
        raw_tags[bpm_key] = bpm_value

    key_value, key_key = _find_first(tag_map, KEY_TAG_KEYS)
    if key_key and key_value:
        raw_tags[key_key] = key_value

    vendor = _detect_vendor(tag_map)

    bpm = None
    if bpm_value:
        bpm = _parse_bpm(bpm_value)
        if bpm is None:
            warnings.append("invalid_bpm_tag")

    key_text = None
    key_camelot = None
    if key_value:
        key_text, key_camelot = parse_key_tag(key_value)
        if not key_text or not key_camelot:
            warnings.append("invalid_key_tag")
            key_text, key_camelot = None, None

    logger.info("read_tags end")
    return TagResult(bpm=bpm, key_text=key_text, key_camelot=key_camelot, raw_tags=raw_tags, warnings=warnings, vendor=vendor)
