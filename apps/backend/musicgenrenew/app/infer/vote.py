from __future__ import annotations

from typing import List, Tuple

import numpy as np

from ..audio.ffmpeg import decode_audio
from ..audio.preprocess import extract_segment, preprocess_waveform_with_backend
from ..config import get_settings
from ..model.infer import _entropy_from_probs, _top2_probs, apply_activation, aggregate_patch_probs, get_model_service


def _entropy_from_top2(top1_prob: float, top2_prob: float) -> float:
    total = top1_prob + top2_prob
    if total <= 0.0:
        return 1.0
    p1 = top1_prob / total
    p2 = top2_prob / total
    return float(-sum(p * np.log(p + 1e-12) for p in (p1, p2)))


def multi_segment_vote_predict(
    path: str,
    segments: List[Tuple[float, float]],
    top_k: int,
    threshold: float,
) -> Tuple[np.ndarray, dict]:
    settings = get_settings()
    service = get_model_service()
    if service._meta is None:  # type: ignore[attr-defined]
        raise RuntimeError("model metadata not loaded")

    audio, sr = decode_audio(path, sample_rate=service._meta.sample_rate, mono=True, clip_seconds=None)
    per_segment_probs: List[np.ndarray] = []
    weights = []
    per_segment_top1 = []

    for start_sec, end_sec in segments:
        segment = extract_segment(audio, sr, start_sec, end_sec, settings.pad_mode)
        features, _segment_duration, _backend, _axis_fix = preprocess_waveform_with_backend(
            segment,
            sr,
            clip_seconds=None,
            pad_mode=settings.pad_mode,
            n_mels=service._meta.n_mels,
            frame_size=service._meta.frame_size or settings.frame_size,
            hop_size=service._meta.hop_size or settings.hop_size,
            patch_frames=service._meta.patch_frames,
            patch_hop_frames=service._meta.patch_hop_frames or settings.patch_hop_frames,
            use_essentia=settings.use_essentia,
            require_essentia=settings.require_essentia,
        )
        logits = service._predict(features)  # type: ignore[attr-defined]
        probs, _activation_mode, _raw_stats = apply_activation(logits)
        segment_probs = aggregate_patch_probs(probs)
        per_segment_probs.append(segment_probs)

        top1_prob, top2_prob, top1_idx = _top2_probs(segment_probs)
        entropy = _entropy_from_top2(top1_prob, top2_prob)
        weight = max(0.0, 1.0 - min(1.0, entropy))
        weights.append(weight)
        per_segment_top1.append({"index": top1_idx, "top1_prob": float(top1_prob)})

    if not per_segment_probs:
        return np.array([]), {"weights": [], "per_segment_top1": []}

    weight_sum = float(np.sum(weights)) if weights else 0.0
    if weight_sum <= 0.0:
        weight_sum = float(len(per_segment_probs))
        weights = [1.0 for _ in per_segment_probs]

    stacked = np.stack(per_segment_probs, axis=0)
    weights_np = np.array(weights, dtype=np.float32).reshape(-1, 1)
    aggregated = np.sum(stacked * weights_np, axis=0) / float(weight_sum)
    return aggregated, {"weights": weights, "per_segment_top1": per_segment_top1}
