from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Dict, Optional

from ..utils.audio_io import get_duration_sec
from .bpm_utils import correct_bpm_for_dj, format_bpm
from .energy import predict_energy
from .essentia_backend import analyze as essentia_analyze, is_available as essentia_available
from .key_utils import parse_key_tag
from .librosa_backend import analyze as librosa_analyze, is_available as librosa_available
from .tags import extract_tags

logger = logging.getLogger("analyzer")


ProgressCallback = Callable[[str, float], None]


@dataclass
class AnalysisResult:
    track: Dict[str, object]
    errors: list[str]


def _safe_confidence(value: Optional[float]) -> float:
    if value is None:
        return 0.0
    return max(0.0, min(1.0, float(value)))


def analyze_bpm_key(path: Path, filename: str, progress_cb: Optional[ProgressCallback] = None) -> AnalysisResult:
    warnings: list[str] = []
    errors: list[str] = []

    def progress(stage: str, percent: float) -> None:
        if progress_cb:
            progress_cb(stage, percent)

    progress("read_tags", 0.1)
    tag_result = extract_tags(path)
    warnings.extend(tag_result.warnings)

    bpm = tag_result.bpm
    key_text = tag_result.key_text
    key_camelot = tag_result.key_camelot
    bpm_source = "tag" if bpm is not None else ""
    key_source = "tag" if key_text and key_camelot else ""
    bpm_confidence = 0.98 if bpm is not None else None
    key_confidence = 0.98 if key_text and key_camelot else None

    backend_used = None

    if bpm is None or key_text is None or key_camelot is None:
        if essentia_available():
            progress("essentia", 0.6)
            result = essentia_analyze(path)
            if result:
                backend_used = "model_essentia"
                if bpm is None and result.bpm is not None:
                    bpm = result.bpm
                    bpm_confidence = result.bpm_confidence
                    bpm_source = "model_essentia"
                if (key_text is None or key_camelot is None) and result.key_text and result.key_camelot:
                    key_text = result.key_text
                    key_camelot = result.key_camelot
                    key_confidence = result.key_confidence
                    key_source = "model_essentia"
            else:
                warnings.append("essentia_failed")
        else:
            warnings.append("essentia_unavailable")

    if bpm is None or key_text is None or key_camelot is None:
        if librosa_available():
            progress("librosa", 0.85)
            result = librosa_analyze(path)
            if result:
                backend_used = backend_used or "model_librosa"
                if bpm is None and result.bpm is not None:
                    bpm = result.bpm
                    bpm_confidence = result.bpm_confidence
                    bpm_source = "model_librosa"
                if (key_text is None or key_camelot is None) and result.key_text and result.key_camelot:
                    key_text = result.key_text
                    key_camelot = result.key_camelot
                    key_confidence = result.key_confidence
                    key_source = "model_librosa"
            else:
                warnings.append("librosa_failed")
        else:
            warnings.append("librosa_unavailable")

    if bpm is not None and bpm_source.startswith("model"):
        corrected, changed = correct_bpm_for_dj(bpm)
        if changed:
            warnings.append(f"bpm_corrected:{bpm:.1f}->{corrected:.1f}")
        bpm = corrected

    if key_text is None or key_camelot is None:
        raw_key_text, raw_key_camelot = parse_key_tag("8A")
        key_text = key_text or raw_key_text or "Unknown"
        key_camelot = key_camelot or raw_key_camelot or "8A"
        warnings.append("key_defaulted")

    if bpm is None:
        bpm = 0.0
        warnings.append("bpm_missing")

    duration_sec = get_duration_sec(path)
    progress("energy", 0.92)
    energy_result = predict_energy(path)
    if energy_result.warning:
        warnings.append(energy_result.warning)
    bpm_display = format_bpm(bpm) if bpm is not None else "0.0"

    if bpm_source == "tag" and key_source == "tag" and tag_result.vendor in {"serato", "rekordbox"}:
        source = tag_result.vendor
    elif bpm_source == key_source and bpm_source in {"model_essentia", "model_librosa"}:
        source = bpm_source
    elif backend_used:
        source = "hybrid"
    else:
        source = tag_result.vendor or "hybrid"

    progress("finalize", 1.0)
    logger.info("finalize result bpm=%s key=%s source=%s", bpm, key_text, source)
    effective_bpm_source = bpm_source or (backend_used or "tag")
    effective_key_source = key_source or (backend_used or "tag")

    track = {
        "id": str(uuid.uuid4()),
        "filename": filename,
        "duration_sec": float(duration_sec),
        "bpm": float(bpm) if bpm is not None else None,
        "bpm_display": bpm_display,
        "key_camelot": key_camelot,
        "key_text": key_text,
        "energy": energy_result.value,
        "confidence": {
            "bpm": _safe_confidence(bpm_confidence),
            "key": _safe_confidence(key_confidence),
        },
        "source": source,
        "details": {
            "bpm_source": effective_bpm_source,
            "key_source": effective_key_source,
            "raw_tags": tag_result.raw_tags,
            "warnings": warnings,
        },
    }

    return AnalysisResult(track=track, errors=errors)
