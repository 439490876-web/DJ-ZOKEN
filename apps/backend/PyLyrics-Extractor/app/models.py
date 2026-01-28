from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class PlatformMatch(BaseModel):
    track_id: str
    title: str
    artist: str
    duration_ms: Optional[int] = None
    score: float


class MasterTrack(BaseModel):
    master_track_id: str
    clean_title: str
    clean_artist: str
    query_title: str
    query_artist: str
    duration_ms: Optional[int] = None
    confidence: float
    decision: str


class EvidenceCandidate(BaseModel):
    track_id: str
    title: str
    artist: str
    duration_ms: Optional[int] = None
    score: float
    popularity: Optional[float] = None


class Evidence(BaseModel):
    used_tags: bool
    used_filename: bool
    queries: List[str]
    top_candidates: Dict[str, List[EvidenceCandidate]]
    cached: bool = False
    cache_hit: bool = False
    cache_ttl_left: Optional[int] = None
    remix_replaced: bool = False
    remix_to_original_swapped: bool = False
    version_tokens: List[str] = Field(default_factory=list)
    stripped_dj_tags: List[str] = Field(default_factory=list)
    insufficient_title_metadata: bool = False
    decision_escalated_to_review: bool = False
    decision_escalation_reason: Optional[str] = None
    dj_edit_mode: bool = False
    duration_mode: Optional[str] = None
    base_text_score_best: Dict[str, float] = Field(default_factory=dict)
    popularity_best: Dict[str, float] = Field(default_factory=dict)
    popularity_bonus_value: Dict[str, float] = Field(default_factory=dict)
    popularity_bonus_applied: Dict[str, bool] = Field(default_factory=dict)
    decision_rule: Dict[str, str] = Field(default_factory=dict)
    duration_delta_best: Dict[str, Optional[int]] = Field(default_factory=dict)
    duration_override_applied: Dict[str, bool] = Field(default_factory=dict)
    netease_source: Optional[str] = None
    netease_base_url: Optional[str] = None
    ncm_status: Optional[str] = None
    used_fallback_api: bool = False
    http_error_code: Optional[int] = None
    error_message: Optional[str] = None
    heat_source: Optional[str] = None
    file_fingerprint: Optional[str] = None


class IdentifyQuery(BaseModel):
    raw_title: str
    cleaned_title: str
    cleaned_artist: str


class IdentifyMatch(BaseModel):
    platform: str
    song_id: str
    name: str
    artist: str
    confidence: float


class HeatInfo(BaseModel):
    heat_score: int
    heat_score_raw: Optional[float] = None
    heat_level: int
    heat_label: str
    heat_badge: str


class IdentifyResponse(BaseModel):
    master_track: MasterTrack
    platform_matches: Dict[str, Optional[PlatformMatch]]
    evidence: Evidence
    query: Optional[IdentifyQuery] = None
    match: Optional[IdentifyMatch] = None
    heat: Optional[HeatInfo] = None
    heat_debug: Optional[Dict[str, Any]] = None


class HealthResponse(BaseModel):
    status: str = "ok"


class DBMasterBundle(BaseModel):
    master_track: MasterTrack
    platform_matches: Dict[str, Optional[PlatformMatch]]
    mappings: List[Dict[str, Any]]
