from __future__ import annotations

import difflib
from typing import List

from .base import BaseClient, Candidate
from ..services.cleaning import normalize_query_text


MOCK_TRACKS = [
    Candidate("dy1", "Blinding Lights", "The Weeknd", 200000, 0.88, {"source": "mock"}),
    Candidate("dy2", "Blinding Lights (Sped Up)", "The Weeknd", 198000, 0.7, {"source": "mock"}),
    Candidate("dy3", "See You Again", "Wiz Khalifa ft. Charlie Puth", 229500, 0.89, {"source": "mock"}),
    Candidate("dy4", "告白气球", "周杰伦", 215500, 0.82, {"source": "mock"}),
    Candidate("dy5", "China", "Anuel AA x Daddy Yankee x KAROL G", 301500, 0.76, {"source": "mock"}),
    Candidate("dy6", "China (DJ Edit)", "Anuel AA", 299000, 0.5, {"source": "mock"}),
    Candidate("dy7", "Lemon", "米津玄師", 258000, 0.92, {"source": "mock"}),
    Candidate("dy8", "Lemon (Live)", "米津玄師", 263000, 0.4, {"source": "mock"}),
    Candidate("dy9", "bad guy", "Billie Eilish", 194500, 0.87, {"source": "mock"}),
    Candidate("dy10", "bad guy (Remix)", "Billie Eilish", 199000, 0.52, {"source": "mock"}),
    Candidate("dy11", "晴天", "周杰伦", 269500, 0.79, {"source": "mock"}),
    Candidate("dy12", "Love Story", "Taylor Swift", 235500, 0.85, {"source": "mock"}),
]


class MockDouyinClient(BaseClient):
    platform = "douyin"

    def search_tracks(self, query: str, limit: int = 20) -> List[Candidate]:
        normalized = normalize_query_text(query)
        scored = []
        for candidate in MOCK_TRACKS:
            haystack = normalize_query_text(f"{candidate.title} {candidate.artist}")
            ratio = difflib.SequenceMatcher(None, normalized, haystack).ratio()
            if normalized and normalized in haystack:
                ratio += 0.2
            scored.append((ratio, candidate))
        scored.sort(key=lambda item: item[0], reverse=True)
        return [item[1] for item in scored[:limit]]
