from __future__ import annotations

import argparse
from pathlib import Path
from typing import List, Optional

from app.model.infer import (
    aggregate_patch_probs,
    apply_activation,
    get_model_service,
    threshold_predictions,
    top_k_predictions,
)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Debug a single audio file inference")
    parser.add_argument("audio_path")
    parser.add_argument("--segment_mode", default="drop", choices=["drop", "full"])
    parser.add_argument("--drop_seconds", type=float, default=20.0)
    parser.add_argument("--drop_strategy", default="energy")
    parser.add_argument("--clip_seconds", type=float, default=30.0)
    parser.add_argument("--top_k", type=int, default=20)
    parser.add_argument("--threshold", type=float, default=0.1)
    return parser


def main(argv: Optional[List[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    path = Path(args.audio_path).expanduser()
    if not path.exists():
        raise SystemExit(f"file not found: {path}")

    service = get_model_service()
    if not service.is_loaded:
        service.load()

    (
        features,
        duration_sec,
        segment_info,
        backend,
        axis_fix,
        _segment_probs,
        _fb_score,
    ) = service._prepare_features_from_file(
        str(path),
        args.clip_seconds,
        args.segment_mode,
        args.drop_strategy,
        args.drop_seconds,
    )
    logits = service._predict(features)
    probs, activation_mode, raw_stats = apply_activation(logits)
    segment_probs = aggregate_patch_probs(probs)

    output_dim = service.output_dim or segment_probs.shape[-1]
    print(f"output_dim: {output_dim}")
    print(f"feature_shape: {tuple(features.shape)} axis_fix={axis_fix}")
    print(f"duration_sec: {duration_sec:.2f}")
    if segment_info:
        print(
            "segment: "
            f"mode={segment_info.get('mode')} "
            f"start={segment_info.get('start_sec')} "
            f"end={segment_info.get('end_sec')}"
        )
    print(
        "raw stats: "
        f"min={raw_stats['min']:.6f} "
        f"max={raw_stats['max']:.6f} "
        f"mean={raw_stats['mean']:.6f} "
        f"std={raw_stats['std']:.6f}"
    )
    print(f"activation_mode: {activation_mode}")
    print(
        "probs stats: "
        f"min={segment_probs.min():.6f} "
        f"max={segment_probs.max():.6f} "
        f"mean={segment_probs.mean():.6f} "
        f"std={segment_probs.std():.6f}"
    )
    print(f"backend: {backend}")

    top = top_k_predictions(segment_probs, service._labels, top_k=args.top_k)
    above = threshold_predictions(segment_probs, service._labels, args.threshold)
    print("top styles:")
    for pred in top:
        print(f"- {pred.style}: {pred.prob:.6f}")
    print(f"above_threshold: {len(above)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
