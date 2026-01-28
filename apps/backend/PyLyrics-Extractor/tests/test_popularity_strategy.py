from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.clients.base import Candidate
from app.services.scoring import InputTrack, select_best_candidate


def test_trusted_pool_prefers_popularity():
    input_track = InputTrack(
        clean_title="Song Name",
        clean_artist="Artist",
        query_title="song name",
        query_artist="artist",
        duration_ms=200000,
        feat_artists=[],
        dj_edit_mode=False,
    )
    low = Candidate("low", "Song Name", "Artist", 200000, 0.2)
    high = Candidate("high", "Song Name", "Artist", 200000, 0.9)

    best, scored, _, rule, _ = select_best_candidate(input_track, [low, high])
    assert best is not None
    assert best.candidate.track_id == "high"
    assert rule in {"TRUSTED_POOL_POPULARITY", "DETERMINISTIC_POPULARITY"}
    assert len(scored) == 2


def test_popularity_does_not_override_artist_mismatch():
    input_track = InputTrack(
        clean_title="Same Title",
        clean_artist="Correct Artist",
        query_title="same title",
        query_artist="correct artist",
        duration_ms=200000,
        feat_artists=[],
        dj_edit_mode=False,
    )
    correct = Candidate("correct", "Same Title", "Correct Artist", 200000, 0.1)
    popular = Candidate("popular", "Same Title", "Other Artist", 200000, 0.95)

    best, _, _, _, _ = select_best_candidate(input_track, [popular, correct])
    assert best is not None
    assert best.candidate.track_id == "correct"
