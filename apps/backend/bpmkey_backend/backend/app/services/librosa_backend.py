from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Optional, Tuple

import numpy as np

from ..utils.audio_io import load_audio_for_librosa, load_audio_via_ffmpeg
from .key_utils import key_to_camelot

logger = logging.getLogger("analyzer")

NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

MAJOR_PROFILE = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
MINOR_PROFILE = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])


@dataclass
class LibrosaResult:
    bpm: Optional[float]
    bpm_confidence: Optional[float]
    key_text: Optional[str]
    key_camelot: Optional[str]
    key_confidence: Optional[float]


def is_available() -> bool:
    try:
        import librosa  # noqa: F401
        return True
    except Exception:
        return False


def _estimate_key(chroma: np.ndarray) -> Tuple[Optional[str], Optional[str], Optional[float]]:
    if chroma.size == 0:
        return None, None, None
    chroma_mean = chroma.mean(axis=1)
    scores_major = []
    scores_minor = []
    for i in range(12):
        scores_major.append(np.dot(chroma_mean, np.roll(MAJOR_PROFILE, i)))
        scores_minor.append(np.dot(chroma_mean, np.roll(MINOR_PROFILE, i)))
    scores_major = np.array(scores_major)
    scores_minor = np.array(scores_minor)

    best_major_idx = int(np.argmax(scores_major))
    best_minor_idx = int(np.argmax(scores_minor))

    best_major = scores_major[best_major_idx]
    best_minor = scores_minor[best_minor_idx]

    if best_major >= best_minor:
        note = NOTE_NAMES[best_major_idx]
        key_text = f"{note} major"
        key_camelot = key_to_camelot(note, "major")
        runner_up = np.partition(scores_major, -2)[-2] if scores_major.size > 1 else 0.0
        confidence = float((best_major - runner_up) / best_major) if best_major else 0.0
    else:
        note = NOTE_NAMES[best_minor_idx]
        key_text = f"{note} minor"
        key_camelot = key_to_camelot(note, "minor")
        runner_up = np.partition(scores_minor, -2)[-2] if scores_minor.size > 1 else 0.0
        confidence = float((best_minor - runner_up) / best_minor) if best_minor else 0.0

    confidence = max(0.0, min(1.0, confidence))
    return key_text, key_camelot, confidence


def analyze(path: Path) -> Optional[LibrosaResult]:
    try:
        import librosa
    except Exception as exc:  # pragma: no cover - optional dependency
        logger.warning("librosa not available: %s", exc)
        return None

    logger.info("librosa start")
    try:
        try:
            y, sr = load_audio_for_librosa(path)
        except Exception as exc:
            logger.warning("librosa load failed, retry ffmpeg: %s", exc)
            y, sr = load_audio_via_ffmpeg(path)
        if y.size == 0:
            return None
        tempo, beats = librosa.beat.beat_track(y=y, sr=sr)
        bpm = float(tempo) if tempo else None
        bpm_confidence = min(1.0, len(beats) / max(1.0, (y.size / sr) / 0.5)) if beats is not None else 0.0
        chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
        key_text, key_camelot, key_confidence = _estimate_key(chroma)
        logger.info("librosa end")
        return LibrosaResult(
            bpm=bpm,
            bpm_confidence=float(bpm_confidence) if bpm_confidence is not None else None,
            key_text=key_text,
            key_camelot=key_camelot,
            key_confidence=key_confidence,
        )
    except Exception as exc:
        logger.exception("librosa analysis failed: %s", exc)
        return None
