from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from .key_utils import key_to_camelot

logger = logging.getLogger("analyzer")


@dataclass
class EssentiaResult:
    bpm: Optional[float]
    bpm_confidence: Optional[float]
    key_text: Optional[str]
    key_camelot: Optional[str]
    key_confidence: Optional[float]


def is_available() -> bool:
    try:
        import essentia.standard  # noqa: F401
        return True
    except Exception:
        return False


def analyze(path: Path) -> Optional[EssentiaResult]:
    try:
        import essentia.standard as es
    except Exception as exc:  # pragma: no cover - optional dependency
        logger.warning("Essentia not available: %s", exc)
        return None

    logger.info("essentia start")
    try:
        audio = es.MonoLoader(filename=str(path), sampleRate=44100)()
        bpm, _, _, confidence = es.RhythmExtractor2013(method="multifeature")(audio)
        key, scale, strength = es.KeyExtractor()(audio)
        key_text = f"{key} {scale}" if key and scale else None
        key_camelot = key_to_camelot(key, scale) if key and scale else None
        logger.info("essentia end")
        return EssentiaResult(
            bpm=float(bpm) if bpm else None,
            bpm_confidence=float(confidence) if confidence is not None else None,
            key_text=key_text,
            key_camelot=key_camelot,
            key_confidence=float(strength) if strength is not None else None,
        )
    except Exception as exc:
        logger.exception("Essentia analysis failed: %s", exc)
        return None
