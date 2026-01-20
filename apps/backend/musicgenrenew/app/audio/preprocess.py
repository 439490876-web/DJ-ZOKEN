from __future__ import annotations

from typing import Optional, Tuple

import numpy as np

import logging

from .ffmpeg import decode_audio


def _pad_or_loop(
    audio: np.ndarray, target_len: int, mode: str
) -> np.ndarray:
    if audio.size >= target_len:
        return audio[:target_len]
    if mode == "loop" and audio.size > 0:
        repeats = target_len // audio.size
        remainder = target_len % audio.size
        pieces = [audio] * repeats
        if remainder:
            pieces.append(audio[:remainder])
        return np.concatenate(pieces)
    pad_len = target_len - audio.size
    return np.pad(audio, (0, pad_len), mode="constant")


def extract_segment(
    waveform: np.ndarray, sr: int, start_sec: float, end_sec: float, pad_mode: str
) -> np.ndarray:
    audio = waveform.astype(np.float32, copy=False)
    duration_sec = audio.size / float(sr) if sr > 0 else 0.0
    if duration_sec <= 0.0:
        return np.zeros(0, dtype=np.float32)

    start_sec = max(0.0, start_sec)
    end_sec = min(duration_sec, end_sec)
    if end_sec <= start_sec:
        start_sec = 0.0
        end_sec = duration_sec

    target_len = max(1, int(round((end_sec - start_sec) * sr)))
    start_idx = max(0, int(round(start_sec * sr)))
    end_idx = min(start_idx + target_len, audio.size)

    segment = audio[start_idx:end_idx]
    if segment.size < target_len:
        segment = _pad_or_loop(segment, target_len, pad_mode)
    else:
        segment = segment[:target_len]
    return segment.astype(np.float32, copy=False)


def _frame_audio(audio: np.ndarray, frame_size: int, hop_size: int) -> np.ndarray:
    if audio.size < frame_size:
        pad_len = frame_size - audio.size
        audio = np.pad(audio, (0, pad_len), mode="constant")
    num_frames = 1 + (audio.size - frame_size) // hop_size
    shape = (num_frames, frame_size)
    strides = (audio.strides[0] * hop_size, audio.strides[0])
    return np.lib.stride_tricks.as_strided(audio, shape=shape, strides=strides)


def _mel_filterbank(
    sr: int, n_fft: int, n_mels: int, fmin: float, fmax: float
) -> np.ndarray:
    def hz_to_mel(freq: float) -> float:
        return 2595.0 * np.log10(1.0 + freq / 700.0)

    def mel_to_hz(mel: float) -> float:
        return 700.0 * (10 ** (mel / 2595.0) - 1.0)

    mels = np.linspace(hz_to_mel(fmin), hz_to_mel(fmax), num=n_mels + 2)
    hz = mel_to_hz(mels)
    bins = np.floor((n_fft + 1) * hz / sr).astype(int)

    filterbank = np.zeros((n_mels, n_fft // 2 + 1), dtype=np.float32)
    for i in range(n_mels):
        left, center, right = bins[i], bins[i + 1], bins[i + 2]
        if center == left:
            center += 1
        if right == center:
            right += 1
        for j in range(left, center):
            filterbank[i, j] = (j - left) / (center - left)
        for j in range(center, right):
            filterbank[i, j] = (right - j) / (right - center)
    return filterbank


def _log_mel_spectrogram(
    audio: np.ndarray,
    sr: int,
    n_mels: int,
    frame_size: int,
    hop_size: int,
    fmin: float,
    fmax: float,
) -> np.ndarray:
    frames = _frame_audio(audio, frame_size, hop_size)
    window = np.hanning(frame_size).astype(np.float32)
    frames = frames * window
    fft = np.fft.rfft(frames, n=frame_size)
    power = np.abs(fft) ** 2
    mel_filter = _mel_filterbank(sr, frame_size, n_mels, fmin, fmax)
    mel_spec = np.dot(power, mel_filter.T)
    mel_spec = np.maximum(mel_spec, 1e-10)
    log_mel = np.log10(mel_spec)
    return log_mel.T


def _split_patches(
    log_mel: np.ndarray, frames_per_patch: int, hop_frames: int
) -> np.ndarray:
    total_frames = log_mel.shape[1]
    if total_frames < frames_per_patch:
        pad = frames_per_patch - total_frames
        log_mel = np.pad(log_mel, ((0, 0), (0, pad)), mode="constant")
        total_frames = frames_per_patch

    patches = []
    for start in range(0, total_frames - frames_per_patch + 1, hop_frames):
        patches.append(log_mel[:, start : start + frames_per_patch])
    if not patches:
        patches.append(log_mel[:, :frames_per_patch])
    return np.stack(patches).astype(np.float32)


def _split_patches_frames_first(
    frames: np.ndarray, frames_per_patch: int, hop_frames: int
) -> np.ndarray:
    total_frames = frames.shape[0]
    if total_frames < frames_per_patch:
        pad = frames_per_patch - total_frames
        frames = np.pad(frames, ((0, pad), (0, 0)), mode="constant")
        total_frames = frames_per_patch

    patches = []
    for start in range(0, total_frames - frames_per_patch + 1, hop_frames):
        patches.append(frames[start : start + frames_per_patch, :])
    if not patches:
        patches.append(frames[:frames_per_patch, :])
    return np.stack(patches).astype(np.float32)


def _align_patches(
    patches: np.ndarray,
    expected_shape: tuple[int, int],
) -> tuple[np.ndarray, bool]:
    if patches.ndim == 2:
        patches = np.expand_dims(patches, axis=0)
    if patches.ndim != 3:
        raise RuntimeError(f"unexpected feature ndim={patches.ndim}")
    if patches.shape[1:] == expected_shape:
        return patches, False
    if patches.shape[1:] == expected_shape[::-1]:
        return np.transpose(patches, (0, 2, 1)), True
    raise RuntimeError(f"unexpected feature shape={patches.shape}, expected={expected_shape}")


def _essentia_muscnn_patches(
    audio: np.ndarray,
    sr: int,
    frames_per_patch: int,
    patch_hop_frames: int,
    expected_shape: tuple[int, int],
) -> tuple[np.ndarray, bool]:
    import essentia.standard as es  # type: ignore

    if not hasattr(es, "TensorflowInputMusiCNN"):
        raise RuntimeError("Essentia TensorflowInputMusiCNN not available")

    tf_input = es.TensorflowInputMusiCNN()
    frames = es.FrameGenerator(audio, frameSize=512, hopSize=256, startFromZero=True)
    bands = [tf_input(frame) for frame in frames]
    if not bands:
        raise RuntimeError("Essentia TensorflowInputMusiCNN returned empty features")
    bands_arr = np.vstack(bands).astype(np.float32)
    patches = _split_patches_frames_first(bands_arr, frames_per_patch, patch_hop_frames)
    return _align_patches(patches, expected_shape)


def preprocess_waveform(
    waveform: np.ndarray,
    sr: int,
    clip_seconds: Optional[float],
    pad_mode: str,
    n_mels: int,
    frame_size: int,
    hop_size: int,
    patch_frames: int,
    patch_hop_frames: int,
) -> Tuple[np.ndarray, float]:
    audio = waveform.astype(np.float32, copy=False)
    duration_sec = audio.size / float(sr) if sr > 0 else 0.0
    if clip_seconds is not None:
        target_len = int(clip_seconds * sr)
        audio = _pad_or_loop(audio, target_len, pad_mode)
        duration_sec = min(duration_sec, clip_seconds)

    audio = np.clip(audio, -1.0, 1.0)
    log_mel = _log_mel_spectrogram(
        audio,
        sr,
        n_mels,
        frame_size,
        hop_size,
        fmin=0.0,
        fmax=sr / 2.0,
    )
    patches = _split_patches(log_mel, patch_frames, patch_hop_frames)
    return patches.astype(np.float32), float(duration_sec)


def preprocess_waveform_with_backend(
    waveform: np.ndarray,
    sr: int,
    clip_seconds: Optional[float],
    pad_mode: str,
    n_mels: int,
    frame_size: int,
    hop_size: int,
    patch_frames: int,
    patch_hop_frames: int,
    use_essentia: bool = True,
    require_essentia: bool = False,
) -> Tuple[np.ndarray, float, str, bool]:
    audio = waveform.astype(np.float32, copy=False)
    duration_sec = audio.size / float(sr) if sr > 0 else 0.0
    if clip_seconds is not None:
        target_len = int(clip_seconds * sr)
        audio = _pad_or_loop(audio, target_len, pad_mode)
        duration_sec = min(duration_sec, clip_seconds)

    logger = logging.getLogger("musicgen")
    if require_essentia and not use_essentia:
        raise RuntimeError("REQUIRE_ESSENTIA=1 but USE_ESSENTIA=0")
    if not use_essentia:
        logger.info("preprocess_backend: numpy_forced")
    if use_essentia:
        try:
            expected_shape = (n_mels, patch_frames)
            patches, axis_fix = _essentia_muscnn_patches(
                audio,
                sr,
                frames_per_patch=n_mels,
                patch_hop_frames=patch_hop_frames,
                expected_shape=expected_shape,
            )
            logger.info("preprocess_backend: essentia")
            return patches.astype(np.float32), float(duration_sec), "essentia", axis_fix
        except Exception as exc:
            logger.warning("essentia_preprocess_failed: %s", exc)
            if require_essentia:
                raise RuntimeError(
                    "Essentia preprocessing failed. Install Essentia via "
                    "`pip install essentia` or build Essentia from source."
                ) from exc

    if use_essentia:
        logger.info("preprocess_backend: numpy_fallback")
    patches, duration_sec = preprocess_waveform(
        audio,
        sr,
        clip_seconds,
        pad_mode,
        n_mels,
        frame_size,
        hop_size,
        patch_frames,
        patch_hop_frames,
    )
    return patches.astype(np.float32), float(duration_sec), "numpy", False


def _preprocess_with_essentia(
    path: str,
    sample_rate: int,
    clip_seconds: Optional[float],
    pad_mode: str,
    n_mels: int,
    frame_size: int,
    hop_size: int,
    patch_frames: int,
    patch_hop_frames: int,
) -> Tuple[np.ndarray, float, bool]:
    import essentia.standard as es  # type: ignore

    loader = es.MonoLoader(filename=path, sampleRate=sample_rate)
    audio = loader()
    duration_sec = audio.size / float(sample_rate)
    if clip_seconds is not None:
        target_len = int(clip_seconds * sample_rate)
        audio = _pad_or_loop(audio, target_len, pad_mode)
        duration_sec = min(duration_sec, clip_seconds)

    expected_shape = (n_mels, patch_frames)
    patches, axis_fix = _essentia_muscnn_patches(
        audio,
        sample_rate,
        frames_per_patch=n_mels,
        patch_hop_frames=patch_hop_frames,
        expected_shape=expected_shape,
    )
    return patches.astype(np.float32), float(duration_sec), axis_fix


def preprocess_audio(
    path: str,
    sample_rate: int,
    clip_seconds: Optional[float],
    pad_mode: str,
    n_mels: int,
    frame_size: int,
    hop_size: int,
    patch_frames: int,
    patch_hop_frames: int,
    use_essentia: bool = True,
) -> Tuple[np.ndarray, float]:
    patches, duration_sec, _backend, _axis_fix = preprocess_audio_with_backend(
        path,
        sample_rate,
        clip_seconds,
        pad_mode,
        n_mels,
        frame_size,
        hop_size,
        patch_frames,
        patch_hop_frames,
        use_essentia=use_essentia,
    )
    return patches, duration_sec

def preprocess_audio_with_backend(
    path: str,
    sample_rate: int,
    clip_seconds: Optional[float],
    pad_mode: str,
    n_mels: int,
    frame_size: int,
    hop_size: int,
    patch_frames: int,
    patch_hop_frames: int,
    use_essentia: bool = True,
    require_essentia: bool = False,
) -> Tuple[np.ndarray, float, str, bool]:
    logger = logging.getLogger("musicgen")
    if require_essentia and not use_essentia:
        raise RuntimeError("REQUIRE_ESSENTIA=1 but USE_ESSENTIA=0")
    if use_essentia:
        try:
            patches, duration_sec, axis_fix = _preprocess_with_essentia(
                path,
                sample_rate,
                clip_seconds,
                pad_mode,
                n_mels,
                frame_size,
                hop_size,
                patch_frames,
                patch_hop_frames,
            )
            logger.info("preprocess_backend: essentia")
            return patches, duration_sec, "essentia", axis_fix
        except Exception as exc:
            logger.warning("essentia_preprocess_failed: %s", exc)
            if require_essentia:
                raise RuntimeError(
                    "Essentia preprocessing failed. Install Essentia via "
                    "`pip install essentia` or build Essentia from source."
                ) from exc

    if use_essentia:
        logger.info("preprocess_backend: numpy_fallback")
    audio, sr = decode_audio(path, sample_rate, mono=True, clip_seconds=clip_seconds)
    patches, duration_sec = preprocess_waveform(
        audio,
        sr,
        clip_seconds,
        pad_mode,
        n_mels,
        frame_size,
        hop_size,
        patch_frames,
        patch_hop_frames,
    )
    return patches, duration_sec, "numpy", False
