from __future__ import annotations

import difflib
from typing import List

from .base import BaseClient, Candidate
from ..services.cleaning import normalize_query_text


MOCK_TRACKS = [
    Candidate("ne1", "Blinding Lights", "The Weeknd", 200200, 0.96, {"source": "mock"}),
    Candidate("ne2", "Blinding Lights (DJ Remix)", "The Weeknd", 205000, 0.62, {"source": "mock"}),
    Candidate("ne3", "See You Again (feat. Charlie Puth)", "Wiz Khalifa", 229000, 0.93, {"source": "mock"}),
    Candidate("ne4", "See You Again (Remix)", "Wiz Khalifa", 231000, 0.58, {"source": "mock"}),
    Candidate("ne5", "告白气球", "周杰伦", 215000, 0.88, {"source": "mock"}),
    Candidate("ne6", "告白气球 (Live)", "周杰伦", 220000, 0.41, {"source": "mock"}),
    Candidate("ne7", "China", "Anuel AA, Daddy Yankee, KAROL G", 301000, 0.8, {"source": "mock"}),
    Candidate("ne8", "China (Remix)", "Anuel AA, Daddy Yankee, KAROL G", 303000, 0.55, {"source": "mock"}),
    Candidate("ne9", "Love Story", "Taylor Swift", 235000, 0.9, {"source": "mock"}),
    Candidate("ne10", "Love Story (Taylor's Version)", "Taylor Swift", 238000, 0.92, {"source": "mock"}),
    Candidate("ne11", "晴天", "周杰伦", 269000, 0.86, {"source": "mock"}),
    Candidate("ne12", "bad guy", "Billie Eilish", 194000, 0.91, {"source": "mock"}),
    Candidate("ne13", "bad guy (Live)", "Billie Eilish", 201000, 0.44, {"source": "mock"}),
]


class MockNeteaseClient(BaseClient):
    platform = "netease"

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

    def fetch_track_detail(self, track_id: str):
        for candidate in MOCK_TRACKS:
            if candidate.track_id == track_id:
                if isinstance(candidate.extra, dict):
                    return candidate.extra
                return {}
        return None
