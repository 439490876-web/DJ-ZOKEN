from __future__ import annotations

from pathlib import Path
from typing import Optional

import numpy as np

from app.config import get_settings
from app.model.chain import resolve_head_enabled
from app.model.downloader import ensure_head_files, ensure_model_files
from app.model.inspect import get_io_summary, resolve_output_dim
from app.model.labels import load_labels


def _print_io(title: str, info: dict) -> None:
    print(f"{title}: name={info['name']} shape={info['shape']}")


def main() -> int:
    settings = get_settings()
    try:
        import onnxruntime as ort
    except ImportError as exc:  # pragma: no cover - runtime guard
        print(f"onnxruntime is not installed: {exc}")
        return 1

    onnx_path, json_path, source = ensure_model_files(settings)
    labels, _, meta = load_labels(json_path, Path(settings.model_dir))

    backbone_session = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    backbone_input, backbone_output = get_io_summary(backbone_session)
    _print_io("backbone_input", backbone_input)
    _print_io("backbone_output", backbone_output)

    dummy_backbone = np.zeros((1, meta.n_mels, meta.patch_frames), dtype=np.float32)
    backbone_output_dim = resolve_output_dim(
        backbone_session,
        output_name=backbone_output["name"],
        input_name=backbone_input["name"],
        dummy_input=dummy_backbone,
    )
    print(f"backbone_output_dim: {backbone_output_dim}")
    print(f"label_count: {len(labels)}")

    head_enabled, reason = resolve_head_enabled(settings, backbone_output_dim)
    head_output_dim: Optional[int] = None
    head_source: Optional[str] = None
    if head_enabled:
        head_onnx_path, head_json_path, head_source = ensure_head_files(settings)
        head_session = ort.InferenceSession(str(head_onnx_path), providers=["CPUExecutionProvider"])
        head_input, head_output = get_io_summary(head_session)
        _print_io("head_input", head_input)
        _print_io("head_output", head_output)

        dummy_head = np.zeros((1, backbone_output_dim), dtype=np.float32)
        head_output_dim = resolve_output_dim(
            head_session,
            output_name=head_output["name"],
            input_name=head_input["name"],
            dummy_input=dummy_head,
        )
        print(f"head_output_dim: {head_output_dim}")

    print(f"head_enabled: {head_enabled}")
    print(f"head_reason: {reason}")
    print(f"model_source: {source}")
    if head_enabled:
        print("head_source: downloaded" if head_source == "downloaded" else "head_source: local")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
