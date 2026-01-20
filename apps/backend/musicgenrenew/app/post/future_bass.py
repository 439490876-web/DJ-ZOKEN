from __future__ import annotations

import math
from typing import Optional

import numpy as np

from ..config import Settings, get_settings


def _band_energy(
    audio: np.ndarray,
    sr: int,
    fmin: float,
    fmax: float,
    frame_size: int = 2048,
    hop_size: int = 1024,
) -> float:
    if audio.size < frame_size:
        pad = frame_size - audio.size
        audio = np.pad(audio, (0, pad), mode="constant")
    frames = []
    for start in range(0, audio.size - frame_size + 1, hop_size):
        frames.append(audio[start : start + frame_size])
    if not frames:
        frames = [audio[:frame_size]]
    frames = np.stack(frames).astype(np.float32)
    window = np.hanning(frame_size).astype(np.float32)
    spectrum = np.fft.rfft(frames * window, n=frame_size, axis=1)
    power = np.abs(spectrum) ** 2
    freqs = np.fft.rfftfreq(frame_size, d=1.0 / sr)
    mask = (freqs >= fmin) & (freqs <= fmax)
    return float(power[:, mask].mean())


def _rms_envelope(audio: np.ndarray, sr: int, frame_sec: float = 0.05, hop_sec: float = 0.01) -> np.ndarray:
    frame_size = max(1, int(frame_sec * sr))
    hop_size = max(1, int(hop_sec * sr))
    if audio.size < frame_size:
        pad = frame_size - audio.size
        audio = np.pad(audio, (0, pad), mode="constant")
    envelopes = []
    for start in range(0, audio.size - frame_size + 1, hop_size):
        frame = audio[start : start + frame_size]
        envelopes.append(math.sqrt(float(np.mean(frame**2) + 1e-12)))
    if not envelopes:
        return np.zeros(1, dtype=np.float32)
    return np.array(envelopes, dtype=np.float32)


def compute_future_bass_score(
    waveform: np.ndarray, sr: int, settings: Optional[Settings] = None
) -> float:
    settings = settings or get_settings()
    audio = waveform.astype(np.float32, copy=False)
    if audio.size == 0 or sr <= 0:
        return 0.0

    sub_energy = _band_energy(audio, sr, 20.0, 80.0)
    mid_energy = _band_energy(audio, sr, 80.0, 200.0)
    high_energy = _band_energy(audio, sr, 6000.0, 12000.0)
    total_energy = _band_energy(audio, sr, 20.0, min(12000.0, sr / 2.0))

    sub_ratio = sub_energy / (mid_energy + 1e-8)
    sub_balance = sub_ratio / (sub_ratio + 1.0)

    high_ratio = high_energy / (total_energy + 1e-8)
    high_norm = min(high_ratio / 0.2, 1.0)

    envelope = _rms_envelope(audio, sr)
    env_sr = sr / max(1, int(0.01 * sr))
    fft = np.fft.rfft(envelope)
    power = np.abs(fft) ** 2
    freqs = np.fft.rfftfreq(len(envelope), d=1.0 / env_sr)
    band_mask = (freqs >= 2.0) & (freqs <= 6.0)
    band_energy = float(power[band_mask].sum())
    total_env_energy = float(power.sum() + 1e-8)
    sidechain_ratio = band_energy / total_env_energy
    sidechain_norm = min(sidechain_ratio / 0.3, 1.0)

    score = (
        settings.future_bass_score_w_sidechain * sidechain_norm
        + settings.future_bass_score_w_high * high_norm
        + settings.future_bass_score_w_sub * sub_balance
    )
    return float(max(0.0, min(1.0, score)))


def future_bass_rerank(
    probs: np.ndarray,
    labels: list,
    fb_score: float,
    settings: Optional[Settings] = None,
) -> tuple[np.ndarray, int]:
    settings = settings or get_settings()
    idx = None
    for i, label in enumerate(labels):
        if getattr(label, "style", "").lower() == "future bass":
            idx = i
            break
    if idx is None:
        return probs, -1

    order = np.argsort(-probs)
    rank = int(np.where(order == idx)[0][0]) + 1
    if fb_score <= settings.future_bass_rerank_threshold or rank > 30:
        return probs, rank

    boost = 1.0 + 0.25 * (fb_score - settings.future_bass_rerank_threshold) / max(
        1e-6, 1.0 - settings.future_bass_rerank_threshold
    )
    boost = min(boost, settings.future_bass_rerank_max_boost)
    adjusted = probs.copy()
    adjusted[idx] *= boost
    return adjusted, rank
