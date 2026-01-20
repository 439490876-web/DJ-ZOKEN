from __future__ import annotations

import logging
import threading
from dataclasses import replace
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional, Tuple

import numpy as np

try:
    import onnxruntime as ort
except ImportError as exc:  # pragma: no cover - handled at runtime
    ort = None  # type: ignore[assignment]
    _ORT_IMPORT_ERROR = exc

from ..audio.ffmpeg import decode_audio
from ..audio.preprocess import (
    extract_segment,
    preprocess_audio_with_backend,
    preprocess_waveform_with_backend,
)
from ..config import Settings, get_settings
from ..logging import log_event
from ..segment.drop import _detect_drop_segment, clamp_drop_segment, detect_drop_candidates
from ..post.future_bass import compute_future_bass_score, future_bass_rerank
from .chain import ModelChain, resolve_head_enabled
from .downloader import ensure_head_files, ensure_model_files
from .inspect import get_io_summary, resolve_output_dim
from .labels import LabelInfo, ModelMetadata, load_labels


@dataclass(frozen=True)
class Prediction:
    style: str
    prob: float
    genre: Optional[str]


class ModelService:
    def __init__(self, settings: Settings):
        self._settings = settings
        self._session: Optional[object] = None
        self._head_session: Optional[object] = None
        self._chain: Optional[ModelChain] = None
        self._labels: List[LabelInfo] = []
        self._style_to_genre = {}
        self._meta: Optional[ModelMetadata] = None
        self._input_name: Optional[str] = None
        self._output_dim: Optional[int] = None
        self._backbone_output_dim: Optional[int] = None
        self._head_output_dim: Optional[int] = None
        self._head_enabled: bool = False
        self._load_lock = threading.Lock()

    def load(self, logger=None) -> None:
        if ort is None:
            raise RuntimeError(f"onnxruntime is not installed: {_ORT_IMPORT_ERROR}")
        if self._session is not None:
            return
        with self._load_lock:
            if self._session is not None:
                return
            onnx_path, json_path, source = ensure_model_files(self._settings)
            labels, style_to_genre, meta = load_labels(json_path, Path(self._settings.model_dir))

            sess_options = ort.SessionOptions()
            sess_options.intra_op_num_threads = self._settings.onnx_intra_op_threads
            sess_options.inter_op_num_threads = self._settings.onnx_inter_op_threads
            if self._settings.onnx_graph_optimization == "ALL":
                sess_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
            elif self._settings.onnx_graph_optimization == "BASIC":
                sess_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_BASIC
            else:
                sess_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_DISABLE_ALL

            session = ort.InferenceSession(str(onnx_path), sess_options, providers=["CPUExecutionProvider"])
            self._input_name = session.get_inputs()[0].name
            output_infos = session.get_outputs()
            output_name = output_infos[0].name
            dummy_backbone = np.zeros((1, meta.n_mels, meta.patch_frames), dtype=np.float32)
            backbone_output_dim = resolve_output_dim(
                session,
                output_name=output_name,
                input_name=self._input_name,
                dummy_input=dummy_backbone,
            )

            head_enabled, head_reason = resolve_head_enabled(self._settings, backbone_output_dim)
            head_session = None
            head_input_name = None
            head_output_dim = None
            head_output_infos = []
            head_source = None
            head_paths = (None, None)
            if head_enabled:
                if not self._settings.model_head_onnx or not self._settings.model_head_json:
                    raise RuntimeError(
                        "classification head required but MODEL_HEAD_ONNX/MODEL_HEAD_JSON not set"
                    )
                head_onnx_path, head_json_path, head_source = ensure_head_files(self._settings)
                head_paths = (head_onnx_path, head_json_path)
                head_session = ort.InferenceSession(
                    str(head_onnx_path),
                    sess_options,
                    providers=["CPUExecutionProvider"],
                )
                head_input_name = head_session.get_inputs()[0].name
                head_output_infos = head_session.get_outputs()
                head_output_name = head_output_infos[0].name
                dummy_head = np.zeros((1, backbone_output_dim), dtype=np.float32)
                head_output_dim = resolve_output_dim(
                    head_session,
                    output_name=head_output_name,
                    input_name=head_input_name,
                    dummy_input=dummy_head,
                )
                if head_output_dim != self._settings.head_expected_dim or len(labels) != self._settings.head_expected_dim:
                    raise RuntimeError(
                        "output_dim mismatch: head_output_dim="
                        f"{head_output_dim} labels={len(labels)} expected={self._settings.head_expected_dim}"
                    )
            else:
                if backbone_output_dim != self._settings.head_expected_dim:
                    raise RuntimeError(
                        "output_dim mismatch: backbone_output_dim="
                        f"{backbone_output_dim} expected={self._settings.head_expected_dim}"
                    )
                if len(labels) != self._settings.head_expected_dim:
                    raise RuntimeError(
                        "output_dim mismatch: label_count="
                        f"{len(labels)} expected={self._settings.head_expected_dim}"
                    )

            self._session = session
            self._head_session = head_session
            self._labels = labels
            self._style_to_genre = style_to_genre
            self._meta = meta
            self._backbone_output_dim = backbone_output_dim
            self._head_output_dim = head_output_dim
            self._head_enabled = head_enabled
            self._output_dim = self._settings.head_expected_dim
            self._chain = ModelChain(
                backbone_session=session,
                backbone_input_name=self._input_name,
                backbone_output_dim=backbone_output_dim,
                head_session=head_session,
                head_input_name=head_input_name,
                head_output_dim=head_output_dim,
            )

            if logger:
                if source == "local":
                    logger.info(
                        f"Using local model files from {self._settings.model_dir} (download skipped)"
                    )
                log_event(
                    logger,
                    "model_loaded",
                    model=str(onnx_path.name),
                    labels=len(labels),
                    sample_rate=meta.sample_rate,
                )
                backbone_in, backbone_out = get_io_summary(session)
                log_event(
                    logger,
                    "model_outputs",
                    backbone_outputs=[backbone_out],
                    backbone_output_dim=backbone_output_dim,
                )
                if head_enabled and head_session is not None:
                    head_in, head_out = get_io_summary(head_session)
                    log_event(
                        logger,
                        "head_outputs",
                        head_outputs=[head_out],
                        head_output_dim=head_output_dim,
                    )
                frame_size = meta.frame_size or self._settings.frame_size
                hop_size = meta.hop_size or self._settings.hop_size
                patch_hop_frames = meta.patch_hop_frames or self._settings.patch_hop_frames
                log_event(
                    logger,
                    "preprocess_params",
                    sample_rate=meta.sample_rate,
                    n_mels=meta.n_mels,
                    frame_size=frame_size,
                    hop_size=hop_size,
                    patch_frames=meta.patch_frames,
                    patch_hop_frames=patch_hop_frames,
                )
                log_event(
                    logger,
                    "model_ready",
                    source=source,
                    onnx=str(onnx_path),
                    json=str(json_path),
                    head_enabled=head_enabled,
                    head_source=head_source,
                    head_onnx=str(head_paths[0]) if head_paths[0] else None,
                    head_json=str(head_paths[1]) if head_paths[1] else None,
                    head_reason=head_reason,
                )

    @property
    def is_loaded(self) -> bool:
        return self._session is not None

    @property
    def label_count(self) -> int:
        return len(self._labels)

    @property
    def output_dim(self) -> Optional[int]:
        return self._output_dim

    @property
    def backbone_output_dim(self) -> Optional[int]:
        return self._backbone_output_dim

    @property
    def head_output_dim(self) -> Optional[int]:
        return self._head_output_dim

    @property
    def head_enabled(self) -> bool:
        return self._head_enabled

    def model_info(self) -> dict:
        name = self._meta.name if self._meta else "discogs-effnet"
        version = self._meta.version if self._meta else None
        file_name = self._settings.model_onnx
        return {
            "name": name,
            "backend": "onnxruntime",
            "labels": self.label_count,
            "version": version,
            "file_name": file_name,
        }

    def _predict(self, features: np.ndarray) -> np.ndarray:
        if self._chain is None:
            raise RuntimeError("model not loaded")
        preds = self._chain.run(features)
        if preds.ndim == 1:
            preds = np.expand_dims(preds, axis=0)
        return preds

    def _prepare_features_from_file(
        self,
        path: str,
        clip_seconds: Optional[float],
        segment_mode: str,
        drop_strategy: str,
        drop_seconds: Optional[float],
        drop_candidate_top_n: Optional[int],
    ) -> Tuple[
        np.ndarray,
        float,
        dict,
        str,
        bool,
        Optional[np.ndarray],
        Optional[float],
        Optional[List[np.ndarray]],
    ]:
        if self._meta is None:
            raise RuntimeError("model metadata not loaded")
        frame_size = self._meta.frame_size or self._settings.frame_size
        hop_size = self._meta.hop_size or self._settings.hop_size
        patch_hop_frames = self._meta.patch_hop_frames or self._settings.patch_hop_frames
        duration_sec = 0.0
        backend = "numpy"
        axis_fix = False
        segment_info = {
            "mode": segment_mode,
            "start_sec": 0.0,
            "end_sec": 0.0,
            "strategy": drop_strategy,
            "drop_seconds": drop_seconds,
        }

        logger = logging.getLogger("musicgen")
        if segment_mode == "drop":
            audio, sr = decode_audio(path, sample_rate=self._meta.sample_rate, mono=True, clip_seconds=None)
            duration_sec = audio.size / float(sr) if sr > 0 else 0.0
            drop_seconds_value = drop_seconds if drop_seconds is not None else self._settings.drop_seconds
            drop_settings = replace(self._settings, drop_seconds=drop_seconds_value)
            candidates = detect_drop_candidates(audio, sr, drop_settings, strategy=drop_strategy)
            if not candidates:
                candidates = [
                    {
                        "start_sec": 0.0,
                        "end_sec": min(duration_sec, drop_seconds_value),
                        "peak_time": 0.0,
                        "score": 0.0,
                    }
                ]

            best_features = None
            best_probs = None
            best_score = -np.inf
            best_backend = backend
            best_axis_fix = axis_fix
            best_start = 0.0
            best_end = min(duration_sec, drop_seconds_value)
            best_metrics = {"gap": 0.0, "entropy": 0.0, "future_bass_score": 0.0, "top1_prob": 0.0}
            best_index = 0
            preview_rows = []
            candidate_results = []
            candidate_top_n = drop_candidate_top_n if drop_candidate_top_n is not None else 1

            for idx, candidate in enumerate(candidates):
                clamped_start, clamped_end, clamped = clamp_drop_segment(
                    duration_sec,
                    candidate["start_sec"],
                    candidate["end_sec"],
                    drop_seconds_value,
                )
                if clamped:
                    logger.warning(
                        "drop_segment_clamped",
                        extra={
                            "duration_sec": duration_sec,
                            "start_sec": candidate["start_sec"],
                            "end_sec": candidate["end_sec"],
                            "strategy": drop_strategy,
                        },
                    )
                segment = extract_segment(audio, sr, clamped_start, clamped_end, self._settings.pad_mode)
                features, _segment_duration, cand_backend, cand_axis_fix = preprocess_waveform_with_backend(
                    segment,
                    sr,
                    clip_seconds=None,
                    pad_mode=self._settings.pad_mode,
                    n_mels=self._meta.n_mels,
                    frame_size=frame_size,
                    hop_size=hop_size,
                    patch_frames=self._meta.patch_frames,
                    patch_hop_frames=patch_hop_frames,
                    use_essentia=self._settings.use_essentia,
                    require_essentia=self._settings.require_essentia,
                )
                logits = self._predict(features)
                probs, _activation_mode, _raw_stats = apply_activation(logits)
                segment_probs = aggregate_patch_probs(probs)
                top1_prob, top2_prob, top1_idx = _top2_probs(segment_probs)
                gap = top1_prob - top2_prob
                entropy = _entropy_from_probs(segment_probs, top_n=50)
                fb_score = compute_future_bass_score(segment, sr, self._settings)
                candidate_score = (
                    self._settings.candidate_score_w_gap * gap
                    - self._settings.candidate_score_w_entropy * entropy
                    + self._settings.candidate_score_w_fb * fb_score
                )

                top1_style = self._labels[top1_idx].style if top1_idx is not None else ""
                preview_rows.append(
                    {
                        "start_sec": float(clamped_start),
                        "end_sec": float(clamped_end),
                        "score": float(candidate_score),
                        "gap": float(gap),
                        "entropy": float(entropy),
                        "future_bass_score": float(fb_score),
                        "top1_style": top1_style,
                    }
                )
                candidate_results.append(
                    {
                        "index": idx,
                        "start_sec": float(clamped_start),
                        "end_sec": float(clamped_end),
                        "score": float(candidate_score),
                        "gap": float(gap),
                        "entropy": float(entropy),
                        "future_bass_score": float(fb_score),
                        "top1_prob": float(top1_prob),
                        "probs": segment_probs,
                    }
                )

                if candidate_score > best_score:
                    best_score = candidate_score
                    best_features = features
                    best_probs = segment_probs
                    best_backend = cand_backend
                    best_axis_fix = cand_axis_fix
                    best_start = clamped_start
                    best_end = clamped_end
                    best_metrics = {
                        "gap": float(gap),
                        "entropy": float(entropy),
                        "future_bass_score": float(fb_score),
                        "top1_prob": float(top1_prob),
                    }
                    best_index = idx

            preview_rows.sort(key=lambda item: item["score"], reverse=True)
            preview_rows = preview_rows[:3]

            if best_features is None or best_probs is None:
                raise RuntimeError("drop candidate selection failed")

            candidate_results.sort(key=lambda item: item["score"], reverse=True)
            candidate_top_n = max(1, min(candidate_top_n, len(candidate_results)))
            candidate_probs = [item["probs"] for item in candidate_results[:candidate_top_n]]

            features = best_features
            backend = best_backend
            axis_fix = best_axis_fix
            segment_info.update(
                {
                    "start_sec": float(best_start),
                    "end_sec": float(best_end),
                    "drop_seconds": float(drop_seconds_value),
                    "candidates_considered": len(candidates),
                    "chosen_index": int(best_index),
                    "chosen_metrics": best_metrics,
                    "candidates_preview": preview_rows,
                    "candidate_top_n": int(candidate_top_n),
                    "candidate_segments": [
                        {
                            "index": item["index"],
                            "start_sec": item["start_sec"],
                            "end_sec": item["end_sec"],
                            "score": item["score"],
                        }
                        for item in candidate_results[:candidate_top_n]
                    ],
                }
            )
            return (
                features,
                duration_sec,
                segment_info,
                backend,
                axis_fix,
                best_probs,
                float(best_metrics["future_bass_score"]),
                candidate_probs,
            )
        else:
            features, duration_sec, backend, axis_fix = preprocess_audio_with_backend(
                path,
                sample_rate=self._meta.sample_rate,
                clip_seconds=clip_seconds,
                pad_mode=self._settings.pad_mode,
                n_mels=self._meta.n_mels,
                frame_size=frame_size,
                hop_size=hop_size,
                patch_frames=self._meta.patch_frames,
                patch_hop_frames=patch_hop_frames,
                use_essentia=self._settings.use_essentia,
                require_essentia=self._settings.require_essentia,
            )
            segment_info.update(
                {
                    "start_sec": 0.0,
                    "end_sec": float(duration_sec),
                    "drop_seconds": float(drop_seconds) if drop_seconds is not None else None,
                }
            )
        return features, duration_sec, segment_info, backend, axis_fix, None, None, None

    def predict_from_file(
        self,
        path: str,
        clip_seconds: Optional[float],
        top_k: int,
        threshold: float,
        segment_mode: str = "drop",
        drop_strategy: str = "energy",
        drop_seconds: Optional[float] = None,
        drop_candidate_top_n: Optional[int] = None,
    ) -> Tuple[List[Prediction], List[Prediction], float, dict, Optional[List[Prediction]]]:
        if self._meta is None:
            raise RuntimeError("model metadata not loaded")
        (
            features,
            duration_sec,
            segment_info,
            backend,
            axis_fix,
            segment_probs,
            _fb_score,
            candidate_probs,
        ) = self._prepare_features_from_file(
            path,
            clip_seconds,
            segment_mode,
            drop_strategy,
            drop_seconds,
            drop_candidate_top_n,
        )
        logger = logging.getLogger("musicgen")
        log_event(
            logger,
            "preprocess_backend",
            backend=backend,
            segment_mode=segment_mode,
            sample_rate=self._meta.sample_rate,
            n_mels=self._meta.n_mels,
            frame_size=self._meta.frame_size or self._settings.frame_size,
            hop_size=self._meta.hop_size or self._settings.hop_size,
            patch_frames=self._meta.patch_frames,
            patch_hop_frames=self._meta.patch_hop_frames or self._settings.patch_hop_frames,
            feature_shape=list(features.shape),
            axis_fix=axis_fix,
        )

        if segment_probs is None:
            logits = self._predict(features)
            expected_dim = self._settings.head_expected_dim
            if logits.shape[-1] != expected_dim:
                raise RuntimeError(
                    f"output_dim mismatch: output_dim={expected_dim} got={logits.shape[-1]}"
                )
            probs, activation_mode, raw_stats = apply_activation(logits)
            log_event(
                logger,
                "activation",
                activation_mode=activation_mode,
                raw_min=raw_stats["min"],
                raw_max=raw_stats["max"],
                raw_mean=raw_stats["mean"],
                raw_std=raw_stats["std"],
            )
            segment_probs = aggregate_patch_probs(probs)
        else:
            log_event(logger, "activation", activation_mode="precomputed")

        top_k = min(top_k, len(self._labels))
        top_styles = top_k_predictions(segment_probs, self._labels, top_k=top_k)
        all_above = threshold_predictions(segment_probs, self._labels, threshold)
        candidate_top_styles = None
        if candidate_probs:
            candidate_top_styles = [
                top_k_predictions(probs, self._labels, top_k=1)[0]
                for probs in candidate_probs
                if probs is not None and probs.size > 0
            ]
        return top_styles, all_above, duration_sec, segment_info, candidate_top_styles


def sigmoid(logits: np.ndarray) -> np.ndarray:
    clipped = np.clip(logits, -50.0, 50.0)
    return 1.0 / (1.0 + np.exp(-clipped))


def apply_activation(raw: np.ndarray) -> Tuple[np.ndarray, str, dict]:
    raw_min = float(np.min(raw))
    raw_max = float(np.max(raw))
    raw_mean = float(np.mean(raw))
    raw_std = float(np.std(raw))
    stats = {"min": raw_min, "max": raw_max, "mean": raw_mean, "std": raw_std}
    if raw_min >= -0.01 and raw_max <= 1.01:
        probs = np.clip(raw, 0.0, 1.0)
        return probs, "raw_probs", stats
    return sigmoid(raw), "sigmoid_logits", stats


def aggregate_patch_probs(probs: np.ndarray) -> np.ndarray:
    if probs.ndim == 1:
        return probs
    return probs.mean(axis=0)


def _top2_probs(probs: np.ndarray) -> Tuple[float, float, Optional[int]]:
    if probs.size == 0:
        return 0.0, 0.0, None
    indexed = [(idx, float(prob)) for idx, prob in enumerate(probs.tolist())]
    indexed.sort(key=lambda item: (-item[1], item[0]))
    top1_idx, top1_prob = indexed[0]
    top2_prob = indexed[1][1] if len(indexed) > 1 else 0.0
    return top1_prob, top2_prob, int(top1_idx)


def _entropy_from_probs(probs: np.ndarray, top_n: int = 50) -> float:
    if probs.size == 0:
        return 0.0
    top_n = min(top_n, probs.size)
    top_probs = np.sort(probs)[::-1][:top_n]
    total = float(np.sum(top_probs))
    if total <= 0.0:
        return 0.0
    normalized = top_probs / total
    return float(-np.sum(normalized * np.log(normalized + 1e-12)))


def top_k_predictions(
    probs: np.ndarray,
    labels: List[LabelInfo],
    top_k: int,
) -> List[Prediction]:
    indexed = [(idx, float(prob), labels[idx]) for idx, prob in enumerate(probs.tolist())]
    indexed.sort(key=lambda item: (-item[1], item[0]))
    indexed = indexed[:top_k]
    return [
        Prediction(style=label.style, prob=prob, genre=label.genre)
        for idx, prob, label in indexed
    ]


def threshold_predictions(
    probs: np.ndarray,
    labels: List[LabelInfo],
    threshold: float,
) -> List[Prediction]:
    indexed = []
    for idx, prob in enumerate(probs.tolist()):
        if prob >= threshold:
            indexed.append((idx, float(prob), labels[idx]))
    indexed.sort(key=lambda item: (-item[1], item[0]))
    return [
        Prediction(style=label.style, prob=prob, genre=label.genre)
        for idx, prob, label in indexed
    ]


_model_service: Optional[ModelService] = None
_model_lock = threading.Lock()


def get_model_service() -> ModelService:
    global _model_service
    if _model_service is None:
        with _model_lock:
            if _model_service is None:
                _model_service = ModelService(get_settings())
    return _model_service
