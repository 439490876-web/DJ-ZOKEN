from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple


@dataclass(frozen=True)
class LabelInfo:
    style: str
    genre: Optional[str]
    raw: str


@dataclass(frozen=True)
class ModelMetadata:
    name: str
    version: str
    sample_rate: int
    n_mels: int
    patch_frames: int
    frame_size: Optional[int]
    hop_size: Optional[int]
    patch_hop_frames: Optional[int]
    label_count: int


def _split_label(label: str) -> Tuple[str, Optional[str]]:
    if "---" in label:
        genre, style = label.split("---", 1)
        return style.strip(), genre.strip()
    return label.strip(), None


def load_labels(json_path: Path, model_dir: Path) -> Tuple[List[LabelInfo], Dict[str, Optional[str]], ModelMetadata]:
    data = json.loads(json_path.read_text())
    classes = data.get("classes") or data.get("labels") or []
    labels: List[LabelInfo] = []
    style_to_genre: Dict[str, Optional[str]] = {}

    for raw in classes:
        style, genre = _split_label(raw)
        labels.append(LabelInfo(style=style, genre=genre, raw=raw))
        style_to_genre.setdefault(style, genre)

    mapping_path = model_dir / "style_to_genre.json"
    if not mapping_path.exists():
        mapping_path.write_text(json.dumps(style_to_genre, indent=2, sort_keys=True))
    else:
        try:
            persisted = json.loads(mapping_path.read_text())
            if isinstance(persisted, dict):
                style_to_genre = persisted
        except json.JSONDecodeError:
            pass

    if style_to_genre:
        labels = [
            LabelInfo(style=label.style, genre=style_to_genre.get(label.style, label.genre), raw=label.raw)
            for label in labels
        ]

    schema = data.get("schema", {})
    inputs = schema.get("inputs", [])
    n_mels = 128
    patch_frames = 96
    if inputs:
        shape = inputs[0].get("shape") or []
        if len(shape) >= 3:
            n_mels = int(shape[1])
            patch_frames = int(shape[2])

    inference = data.get("inference", {})
    preprocess = data.get("preprocessing", {})
    sample_rate = int(inference.get("sample_rate", 16000))

    def _opt_int(value) -> Optional[int]:
        try:
            return int(value)
        except (TypeError, ValueError):
            return None

    frame_size = _opt_int(inference.get("frame_size") or preprocess.get("frame_size") or data.get("frame_size"))
    hop_size = _opt_int(inference.get("hop_size") or preprocess.get("hop_size") or data.get("hop_size"))
    patch_hop_frames = _opt_int(
        inference.get("patch_hop_frames")
        or preprocess.get("patch_hop_frames")
        or data.get("patch_hop_frames")
    )
    meta = ModelMetadata(
        name=data.get("name", "discogs-effnet"),
        version=str(data.get("version", "1")),
        sample_rate=sample_rate,
        n_mels=n_mels,
        patch_frames=patch_frames,
        frame_size=frame_size,
        hop_size=hop_size,
        patch_hop_frames=patch_hop_frames,
        label_count=len(labels),
    )
    return labels, style_to_genre, meta
