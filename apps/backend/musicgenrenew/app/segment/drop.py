from __future__ import annotations

from typing import Dict, List, Tuple

import numpy as np

from ..config import Settings, get_settings


def _frame_audio(audio: np.ndarray, frame_size: int, hop_size: int) -> np.ndarray:
    if audio.size < frame_size:
        audio = np.pad(audio, (0, frame_size - audio.size), mode="constant")
    num_frames = 1 + (audio.size - frame_size) // hop_size
    shape = (num_frames, frame_size)
    strides = (audio.strides[0] * hop_size, audio.strides[0])
    return np.lib.stride_tricks.as_strided(audio, shape=shape, strides=strides)


def _moving_average(values: np.ndarray, window: int) -> np.ndarray:
    if window <= 1:
        return values
    kernel = np.ones(window, dtype=np.float32) / float(window)
    return np.convolve(values, kernel, mode="same")


def _next_pow_two(value: int) -> int:
    return 1 << (value - 1).bit_length()


def detect_drop_candidates(
    waveform: np.ndarray,
    sr: int,
    settings: Settings,
    *,
    strategy: str = "energy",
) -> List[Dict[str, float]]:
    if strategy != "energy":
        raise ValueError(f"unsupported strategy: {strategy}")

    audio = waveform.astype(np.float32, copy=False)
    duration = audio.size / float(sr) if sr > 0 else 0.0
    if duration <= 0:
        return []

    if duration < settings.drop_seconds + settings.drop_min_duration_margin:
        end = min(duration, settings.drop_seconds)
        return [
            {
                "start_sec": 0.0,
                "end_sec": end,
                "peak_time": 0.0,
                "score": 0.0,
            }
        ]

    hop_size = max(1, int(settings.drop_hop_sec * sr))
    frame_size = max(hop_size, int(settings.drop_frame_sec * sr))
    frames = _frame_audio(audio, frame_size, hop_size).astype(np.float32)

    rms = np.sqrt(np.mean(frames**2, axis=1) + 1e-12)
    smooth_window = max(1, int(settings.drop_smooth_sec / settings.drop_hop_sec))
    rms_smooth = _moving_average(rms, smooth_window)

    n_fft = _next_pow_two(frame_size)
    window = np.hanning(frame_size).astype(np.float32)
    spectrum = np.fft.rfft(frames * window, n=n_fft, axis=1)
    mag = np.abs(spectrum)
    power = mag**2
    freqs = np.fft.rfftfreq(n_fft, d=1.0 / sr)

    low_mask = (freqs >= settings.drop_low_freq_min) & (freqs <= settings.drop_low_freq_max)
    high_mask = (freqs >= settings.drop_low_freq_min) & (freqs <= settings.drop_high_freq_max)
    low_energy = power[:, low_mask].sum(axis=1)
    high_energy = power[:, high_mask].sum(axis=1)
    low_band_ratio = low_energy / (high_energy + 1e-8)

    flux = np.zeros_like(rms)
    if mag.shape[0] > 1:
        diff = mag[1:] - mag[:-1]
        flux[1:] = np.sum(np.maximum(diff, 0.0), axis=1)
    onset_strength = flux

    top_n = min(settings.drop_candidates_k, rms_smooth.size)
    if top_n <= 0:
        end = min(duration, settings.drop_seconds)
        return [
            {
                "start_sec": 0.0,
                "end_sec": end,
                "peak_time": 0.0,
                "score": 0.0,
            }
        ]

    peak_indices = np.argpartition(rms_smooth, -top_n)[-top_n:]
    peak_indices = peak_indices[np.argsort(rms_smooth[peak_indices])[::-1]]

    candidates = []
    for peak_idx in peak_indices:
        peak_time = peak_idx * settings.drop_hop_sec
        start = peak_time - settings.drop_pre_roll_sec
        end = start + settings.drop_seconds

        start = max(0.0, start)
        end = min(duration, end)
        if end <= start:
            continue

        start_idx = max(0, int(start / settings.drop_hop_sec))
        end_idx = max(start_idx + 1, int(np.ceil(end / settings.drop_hop_sec)))
        end_idx = min(end_idx, rms.size)

        rms_slice = rms[start_idx:end_idx]
        if rms_slice.size == 0:
            continue

        score = (
            settings.drop_w1 * float(np.mean(rms_slice))
            + settings.drop_w2 * float(np.mean(low_band_ratio[start_idx:end_idx]))
            + settings.drop_w3 * float(np.mean(onset_strength[start_idx:end_idx]))
        )
        if settings.drop_w4 > 0:
            score -= settings.drop_w4 * float(np.var(rms_slice))

        candidates.append(
            {
                "start_sec": start,
                "end_sec": end,
                "peak_time": peak_time,
                "score": float(score),
            }
        )

    candidates.sort(key=lambda item: item["score"], reverse=True)
    return candidates


def _detect_drop_segment(
    waveform: np.ndarray,
    sr: int,
    settings: Settings,
    *,
    strategy: str = "energy",
) -> Tuple[float, float]:
    candidates = detect_drop_candidates(waveform, sr, settings, strategy=strategy)
    if not candidates:
        return 0.0, 0.0
    best = candidates[0]
    return float(best["start_sec"]), float(best["end_sec"])


def clamp_drop_segment(
    duration_sec: float,
    start_sec: float,
    end_sec: float,
    drop_seconds: float,
) -> Tuple[float, float, bool]:
    if duration_sec <= 0:
        return 0.0, 0.0, True
    if start_sec < 0.0 or end_sec > duration_sec or start_sec >= end_sec:
        return 0.0, min(duration_sec, drop_seconds), True
    return start_sec, end_sec, False


def detect_drop_segment(
    waveform: np.ndarray, sr: int, *, strategy: str = "energy"
) -> Tuple[float, float]:
    settings = get_settings()
    return _detect_drop_segment(waveform, sr, settings, strategy=strategy)
