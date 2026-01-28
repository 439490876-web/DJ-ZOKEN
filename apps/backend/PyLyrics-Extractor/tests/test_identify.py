import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.clients.base import Candidate
from app.services.cleaning import clean_track, split_artist_title
from app.services.scoring import InputTrack, decision_from_score, score_candidate, select_best_candidate


def test_split_artist_title_dash():
    artist, title, confidence = split_artist_title("Artist - Title")
    assert artist == "Artist"
    assert title == "Title"
    assert confidence >= 0.6


def test_split_artist_title_underscore():
    artist, title, confidence = split_artist_title("Artist_Title")
    assert artist == "Artist"
    assert title == "Title"
    assert confidence >= 0.5


def test_clean_track_remix_and_feat():
    result = clean_track("Song Name (DJ Remix) feat. A", "Artist")
    assert result.clean_title == "Song Name feat. A"
    assert result.query_title == "song name"
    assert "remix" in " ".join(result.version_tokens).lower()
    assert "A" in result.feat_artists


def test_clean_track_mashup_vs_prefers_segment():
    result = clean_track(
        "Forever Vs. Want It (Jayceeoh Mashup) [Dirty] 4A 80",
        "DJ Surda x Drake",
    )
    assert result.query_title == "forever"
    assert any(token.lower() == "mashup" for token in result.version_tokens)


def test_clean_track_strips_reggaeton_tag():
    result = clean_track(
        "As Long As You Love Me [Reggaeton] [Clean] 8A 98",
        "DJ Yan x Backstreet Boys",
    )
    assert result.query_title == "as long as you love me"
    assert "reggaeton" in " ".join(result.stripped_dj_tags).lower()


def test_clean_track_keeps_funk_in_title():
    result = clean_track("Uptown Funk", "Mark Ronson Bruno Mars")
    assert result.query_title == "uptown funk"


def test_score_candidate_duration_penalty():
    input_track = InputTrack(
        clean_title="Blinding Lights",
        clean_artist="The Weeknd",
        query_title="blinding lights",
        query_artist="the weeknd",
        duration_ms=200000,
        feat_artists=[],
        dj_edit_mode=False,
    )
    good = Candidate("t1", "Blinding Lights", "The Weeknd", 200500, 0.5)
    bad = Candidate("t2", "Blinding Lights", "The Weeknd", 210000, 0.5)
    score_good, _ = score_candidate(input_track, good)
    score_bad, _ = score_candidate(input_track, bad)
    assert score_good > score_bad


def test_decision_thresholds():
    assert decision_from_score(0.9) == "AUTO_MATCH"
    assert decision_from_score(0.75) == "NEEDS_REVIEW"
    assert decision_from_score(0.5) == "NO_MATCH"


def test_remix_replacement(monkeypatch):
    input_track = InputTrack(
        clean_title="Song Name",
        clean_artist="Artist",
        query_title="song name",
        query_artist="artist",
        duration_ms=200000,
        feat_artists=[],
        dj_edit_mode=False,
    )
    remix = Candidate("r1", "Song Name (Remix)", "Artist", 200000, 0.9)
    original = Candidate("o1", "Song Name", "Artist", 200000, 0.1)

    def fake_score(track, candidate):
        if "remix" in candidate.title.lower():
            return 0.82, {}
        return 0.8, {}

    monkeypatch.setattr("app.services.scoring.score_candidate", fake_score)
    best, scored, replaced, _, _ = select_best_candidate(input_track, [remix, original])
    assert replaced is True
    assert best is not None
    assert best.candidate.track_id == "o1"
    assert scored[0].candidate.track_id == "r1"


def test_title_similarity_with_feat_stripped():
    input_track = InputTrack(
        clean_title="陷阱张学友",
        clean_artist="PSY.P KIV",
        query_title="陷阱张学友",
        query_artist="psy.p kiv",
        duration_ms=195000,
        feat_artists=["KIV"],
        dj_edit_mode=False,
    )
    candidate = Candidate(
        "t1", "陷阱张学友 (feat. KIV)", "PSY.P/KIV", 195000, 0.5
    )
    score, details = score_candidate(input_track, candidate)
    assert details["title_similarity"] >= 0.9
