from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class Confidence(BaseModel):
    bpm: float = Field(..., ge=0.0, le=1.0)
    key: float = Field(..., ge=0.0, le=1.0)


class TrackDetails(BaseModel):
    bpm_source: str
    key_source: str
    raw_tags: Dict[str, Any]
    warnings: List[str]


class TrackResult(BaseModel):
    id: str
    filename: str
    duration_sec: float
    bpm: Optional[float]
    bpm_display: str
    key_camelot: str
    key_text: str
    confidence: Confidence
    source: str
    details: TrackDetails


class AnalyzeResponse(BaseModel):
    ok: bool
    track: Optional[TrackResult]
    errors: List[str]


class BatchSubmitResponse(BaseModel):
    ok: bool
    job_id: str
    total: int
