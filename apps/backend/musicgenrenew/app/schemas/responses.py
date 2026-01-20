from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel


class Prediction(BaseModel):
    style: str
    prob: float
    genre: Optional[str] = None


class ModelInfo(BaseModel):
    name: str
    backend: str
    labels: int
    version: str | None = None
    file_name: str | None = None


class SegmentInfo(BaseModel):
    mode: str
    start_sec: float
    end_sec: float
    strategy: str
    drop_seconds: float | None = None
    candidate_top_n: int | None = None
    candidate_segments: List[dict] | None = None


class FilenameDecodeInfo(BaseModel):
    attempted: bool
    method: str
    success: bool


class ErrorInfo(BaseModel):
    code: str
    message: str
    detail: str | None = None


class PredictResponse(BaseModel):
    request_id: str
    duration_sec: float
    top_styles: List[Prediction]
    all_above_threshold: List[Prediction]
    segment: SegmentInfo | None = None
    model_info: ModelInfo
    candidate_top_styles: List[Prediction] | None = None
    dj_style: str | None = None
    dj_confidence: float | None = None
    dj_reason: List[str] | None = None
    reranked_top_styles: List[Prediction] | None = None
    segment_strategy_used: str | None = None
    filename_raw: str | None = None
    filename_original: str | None = None
    filename_display: str
    filename_decode: FilenameDecodeInfo
    error: ErrorInfo | None = None


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    label_count: int
    output_dim: int | None = None
    backbone_output_dim: int | None = None
    head_enabled: bool | None = None
    head_output_dim: int | None = None
