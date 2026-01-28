import os
from pathlib import Path

import pytest

from app.clients.base import BaseClient, Candidate
from app.db.sqlite import SQLiteStore
from app.services import identify as identify_module
from app.services.scoring import ScoredCandidate


class DummyNeteaseClient(BaseClient):
    platform = "netease"

    def search_tracks(self, query: str, limit: int = 20):
        return []


def test_online_required_skips_local_estimation(monkeypatch, tmp_path):
    sample = Path(
        "/Users/apple/work/NEWSETki/apps/backend/newenergy/vibenet/sample.wav"
    )
    assert sample.exists()

    monkeypatch.setenv("HEAT_REQUIRE_ONLINE", "1")

    monkeypatch.setattr(
        identify_module,
        "_build_clients",
        lambda: ([DummyNeteaseClient()], "enhanced_api", "http://127.0.0.1:3001"),
    )
    monkeypatch.setattr(identify_module, "_read_tags", lambda *_: (None, None, None), raising=False)

    store = SQLiteStore(db_path=str(tmp_path / "test.db"))
    with pytest.raises(identify_module.OnlineHeatRequiredError) as excinfo:
        identify_module.identify_file(
            str(sample),
            sample.name,
            store,
            debug=False,
            file_bytes=sample.read_bytes(),
        )
    assert excinfo.value.reason in {"search_failed", "netease_unavailable"}



def test_online_required_accepts_v4_popcomment(monkeypatch, tmp_path):
    sample = Path(
        "/Users/apple/work/NEWSETki/apps/backend/newenergy/vibenet/sample.wav"
    )
    assert sample.exists()

    monkeypatch.setenv("HEAT_REQUIRE_ONLINE", "1")

    dummy_client = DummyNeteaseClient()
    monkeypatch.setattr(
        identify_module,
        "_build_clients",
        lambda: ([dummy_client], "enhanced_api", "http://127.0.0.1:3001"),
    )
    monkeypatch.setattr(
        identify_module,
        "_read_tags",
        lambda *_: (None, None, None),
        raising=False,
    )

    candidate = Candidate(
        track_id="123",
        title="Test Song",
        artist="Test Artist",
        duration_ms=100000,
        popularity=0.9,
    )

    scored = ScoredCandidate(
        candidate=candidate,
        score=0.92,
        details={"base_text_score": 0.9, "duration_delta": 0, "duration_mode": "strict"},
    )

    monkeypatch.setattr(
        identify_module,
        "select_best_candidate",
        lambda *_: (
            scored,
            [scored],
            False,
            "TEST",
            {
                "trusted_pool_non_empty": True,
                "trusted_pool_pop_rank": 1,
                "trusted_pool_pop_top2_close": False,
            },
        ),
    )

    monkeypatch.setattr(
        identify_module,
        "_fetch_netease_detail",
        lambda *_: ({"dummy": True}, False, None),
    )
    monkeypatch.setattr(
        identify_module,
        "normalize_netease_metrics",
        lambda *_: {
            "popularity": 100,
            "comment_count": 20000,
            "play_count": 0,
            "liked_count": 0,
            "share_count": 0,
            "publish_time": 0,
        },
    )

    def _fake_compute(metrics, debug=False):
        return {
            "heat_score": 8,
            "heat_score_raw": 8.88,
            "heat_level": 8,
            "heat_label": "Hot",
            "heat_badge": "🔥",
            "breakdown": {
                "mode": "pop_comment_v2",
                "v2": {"Base": 1.0, "Bonus": 1.0},
            },
        }

    monkeypatch.setattr(identify_module, "compute_heat_score", _fake_compute)

    store = SQLiteStore(db_path=str(tmp_path / "test.db"))
    response = identify_module.identify_file(
        str(sample),
        sample.name,
        store,
        debug=False,
        file_bytes=sample.read_bytes(),
    )
    assert response.evidence.heat_source == "v4-popcomment"
