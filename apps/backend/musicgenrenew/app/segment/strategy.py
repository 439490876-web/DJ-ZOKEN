from __future__ import annotations

from typing import List, Optional

from ..dj_rules.constants import BLACKHOLE_STYLES, LATIN_HINT_STYLES, TRAP_FAMILY, normalize_style
from ..model.infer import Prediction


def _style_in_set(value: str, styles: set[str]) -> bool:
    value_norm = normalize_style(value)
    for item in styles:
        if value_norm == normalize_style(item):
            return True
    return False


def choose_segment_strategy(
    top_styles: List[Prediction],
    extra_candidates: Optional[List[Prediction]] = None,
    maybe_bpm: Optional[float] = None,
) -> str:
    styles = top_styles or []
    extra = extra_candidates or []

    has_blackhole = any(_style_in_set(pred.style, BLACKHOLE_STYLES) for pred in styles[:2])
    has_trap_family = any(_style_in_set(pred.style, TRAP_FAMILY) for pred in styles[:3])
    has_latin_hint = any(_style_in_set(pred.style, LATIN_HINT_STYLES) for pred in extra)

    if (has_blackhole or has_trap_family) and has_latin_hint:
        return "groove_peak"

    return "energy"
