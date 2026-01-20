from __future__ import annotations

import argparse
from pathlib import Path
from typing import List, Optional, Tuple

import numpy as np

from app.audio.preprocess import preprocess_waveform
from app.config import get_settings
from app.model.downloader import ensure_model_files
from app.model.labels import load_labels
from app.segment.drop import _detect_drop_segment, clamp_drop_segment
from app.audio.ffmpeg import decode_audio
from app.audio.preprocess import extract_segment


def _stats(arr: np.ndarray) -> dict:
    return {
        "min": float(np.min(arr)),
        "max": float(np.max(arr)),
        "mean": float(np.mean(arr)),
        "std": float(np.std(arr)),
    }


def _format_stats(stats: dict) -> str:
    return (
        f"min={stats['min']:.6f} "
        f"max={stats['max']:.6f} "
        f"mean={stats['mean']:.6f} "
        f"std={stats['std']:.6f}"
    )


def _align_and_diff(a: np.ndarray, b: np.ndarray) -> Tuple[Optional[float], Optional[float]]:
    if a.ndim != 3 or b.ndim != 3:
        return None, None
    min_patches = min(a.shape[0], b.shape[0])
    if a.shape[1:] != b.shape[1:]:
        return None, None
    a_slice = a[:min_patches]
    b_slice = b[:min_patches]
    diff = a_slice - b_slice
    l2 = float(np.linalg.norm(diff))
    l2_mean = float(np.linalg.norm(diff) / max(1, min_patches))
    return l2, l2_mean


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


def _align_patches(patches: np.ndarray, expected_shape: tuple[int, int]) -> np.ndarray:
    if patches.ndim == 2:
        patches = np.expand_dims(patches, axis=0)
    if patches.shape[1:] == expected_shape:
        return patches
    if patches.shape[1:] == expected_shape[::-1]:
        return np.transpose(patches, (0, 2, 1))
    raise RuntimeError(f"unexpected feature shape={patches.shape}, expected={expected_shape}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Compare Essentia vs numpy preprocessing outputs")
    parser.add_argument("audio_path")
    parser.add_argument("--segment_mode", default="drop", choices=["drop", "full"])
    parser.add_argument("--drop_seconds", type=float, default=20.0)
    parser.add_argument("--drop_strategy", default="energy")
    parser.add_argument("--clip_seconds", type=float, default=30.0)
    return parser


def main(argv: Optional[List[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    path = Path(args.audio_path).expanduser()
    if not path.exists():
        raise SystemExit(f"file not found: {path}")

    settings = get_settings()
    onnx_path, json_path, _source = ensure_model_files(settings)
    labels, _style_to_genre, meta = load_labels(json_path, Path(settings.model_dir))

    audio, sr = decode_audio(str(path), sample_rate=meta.sample_rate, mono=True, clip_seconds=None)
    duration_sec = audio.size / float(sr) if sr > 0 else 0.0
    segment_start = 0.0
    segment_end = duration_sec
    if args.segment_mode == "drop":
        start_sec, end_sec = _detect_drop_segment(audio, sr, settings, strategy=args.drop_strategy)
        segment_start, segment_end, _clamped = clamp_drop_segment(
            duration_sec,
            start_sec,
            end_sec,
            args.drop_seconds,
        )
        segment = extract_segment(audio, sr, segment_start, segment_end, settings.pad_mode)
    else:
        segment = audio

    if args.clip_seconds:
        target_len = int(args.clip_seconds * sr)
        if segment.size < target_len:
            pad = target_len - segment.size
            segment = np.pad(segment, (0, pad), mode="constant")
        else:
            segment = segment[:target_len]

    try:
        import essentia.standard as es  # type: ignore
    except Exception as exc:
        raise SystemExit(f"Essentia not available: {exc}")

    if not hasattr(es, "TensorflowInputMusiCNN"):
        raise SystemExit("Essentia TensorflowInputMusiCNN not available")

    tf_input = es.TensorflowInputMusiCNN()
    frames = es.FrameGenerator(segment, frameSize=512, hopSize=256, startFromZero=True)
    bands = [tf_input(frame) for frame in frames]
    if not bands:
        raise SystemExit("Essentia TensorflowInputMusiCNN returned empty features")
    bands_arr = np.vstack(bands).astype(np.float32)
    patch_frames = meta.n_mels
    patch_hop_frames = meta.patch_hop_frames or settings.patch_hop_frames
    expected_shape = (meta.n_mels, meta.patch_frames)
    essentia_patches = _split_patches_frames_first(bands_arr, patch_frames, patch_hop_frames)
    essentia_patches = _align_patches(essentia_patches, expected_shape)
    numpy_patches, _duration = preprocess_waveform(
        segment,
        sr,
        clip_seconds=None,
        pad_mode=settings.pad_mode,
        n_mels=meta.n_mels,
        frame_size=meta.frame_size or settings.frame_size,
        hop_size=meta.hop_size or settings.hop_size,
        patch_frames=meta.patch_frames,
        patch_hop_frames=meta.patch_hop_frames or settings.patch_hop_frames,
    )

    print(f"segment_mode: {args.segment_mode}")
    print(f"segment_start: {segment_start:.2f} segment_end: {segment_end:.2f}")
    print(f"essentia shape: {essentia_patches.shape} {_format_stats(_stats(essentia_patches))}")
    print(f"numpy shape: {numpy_patches.shape} {_format_stats(_stats(numpy_patches))}")

    l2, l2_mean = _align_and_diff(essentia_patches, numpy_patches)
    if l2 is None:
        print("L2 diff: shape mismatch; cannot compare directly")
    else:
        print(f"L2 diff: {l2:.6f} (mean per patch: {l2_mean:.6f})")
    print("If the difference is huge, numpy preprocessing likely mismatches the model.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
