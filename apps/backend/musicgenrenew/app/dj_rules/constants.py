from __future__ import annotations

from typing import Dict, Set


def _normalize(name: str) -> str:
    return "".join(ch.lower() for ch in name if ch.isalnum())


BLACKHOLE_STYLES: Set[str] = {"Grime", "Crunk"}
TRAP_FAMILY: Set[str] = {"Trap", "Cloud Rap", "Hip Hop", "Crunk", "Grime"}
EDM_FAMILY: Set[str] = {
    "Electro House",
    "House",
    "Drum n Bass",
    "Dubstep",
    "Hardstyle",
    "Trance",
    "Electro",
}
LATIN_HINT_STYLES: Set[str] = {
    "Reggaeton",
    "Latin",
    "MPB",
    "Salsa",
    "Merengue",
    "Cumbia",
    "Bachata",
    "Funk Carioca",
    "Baile Funk",
}

LATIN_ALIAS_MAP: Dict[str, str] = {
    _normalize("Funk Carioca"): "Baile Funk",
    _normalize("Baile Funk"): "Baile Funk",
}


def normalize_style(value: str) -> str:
    return _normalize(value)


def resolve_latin_alias(value: str) -> str:
    key = normalize_style(value)
    return LATIN_ALIAS_MAP.get(key, value)
