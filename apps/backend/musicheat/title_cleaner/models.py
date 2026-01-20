from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional


@dataclass
class TitleCleanResult:
    raw_title: str
    raw_artist: Optional[str]
    source: str
    normalized_title: str
    base_title: str
    main_artist: Optional[str]
    featured_artists: List[str] = field(default_factory=list)
    is_derivative: bool = False
    derivative_type: Optional[str] = None
    is_processing_noise: bool = False
    processing_removed_tokens: List[str] = field(default_factory=list)
    processing_removed_segments: List[str] = field(default_factory=list)
    title_quality: str = "OK"
    quality_reasons: List[str] = field(default_factory=list)
    removed_segments: List[str] = field(default_factory=list)
    removed_tokens: List[str] = field(default_factory=list)
    split_strategy: Optional[str] = None
    split_confidence: float = 0.0
    warnings: List[str] = field(default_factory=list)
