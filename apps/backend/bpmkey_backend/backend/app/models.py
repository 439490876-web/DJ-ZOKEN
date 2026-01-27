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
    energy: Optional[float] = None
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


class SetListPayload(BaseModel):
    id: str
    name: str
    type: str
    tracks: List[Dict[str, Any]] = Field(default_factory=list)
    totalDuration: str


class SetListsResponse(BaseModel):
    ok: bool
    setlists: List[SetListPayload]


class SetListResponse(BaseModel):
    ok: bool
    setlist: SetListPayload
