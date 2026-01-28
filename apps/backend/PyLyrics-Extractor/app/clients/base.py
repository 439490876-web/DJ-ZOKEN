from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Dict, List, Optional


@dataclass
class Candidate:
    track_id: str
    title: str
    artist: str
    duration_ms: Optional[int] = None
    popularity: Optional[float] = None
    extra: Optional[Dict[str, str]] = None


class BaseClient(ABC):
    platform: str

    @abstractmethod
    def search_tracks(self, query: str, limit: int = 20) -> List[Candidate]:
        raise NotImplementedError
