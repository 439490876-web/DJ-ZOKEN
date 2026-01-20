from __future__ import annotations

from typing import Tuple


def correct_bpm_for_dj(bpm: float) -> Tuple[float, bool]:
    if bpm <= 0:
        return bpm, False
    adjusted = float(bpm)
    while adjusted < 70.0:
        adjusted *= 2.0
    while adjusted > 180.0:
        adjusted /= 2.0
    return adjusted, adjusted != bpm


def format_bpm(bpm: float) -> str:
    return f"{bpm:.1f}"
