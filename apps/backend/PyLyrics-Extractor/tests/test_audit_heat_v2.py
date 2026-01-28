import math
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

REPO_ROOT = None
for parent in ROOT.parents:
    if (parent / "scripts").exists() and (parent / "apps").exists():
        REPO_ROOT = parent
        break
if REPO_ROOT is None:
    REPO_ROOT = ROOT.parents[4]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.audit_heat_v2 import (
    compute_v2_intermediates,
    get_env_params,
    repeat_fetch_metrics,
    build_top20_breakdown,
)


def test_repeat_fetch_metrics_reports_jitter():
    def fake_fetch(track_id):
        return {
            "ok": True,
            "popularity": 10,
            "comment_count": 1,
            "publish_time": 123,
            "raw_source": "detail:/song/detail:comma",
            "popularity_source": "pop",
            "comment_source": "comment_count",
        }

    out = repeat_fetch_metrics("123", "Song", 3, fake_fetch)
    assert out["failed"] == 0
    assert out["same_popularity"] == 1
    assert out["same_comment"] == 1
    assert out["error_reason"] is None
    assert out["raw_source_run1"] == "detail:/song/detail:comma"


def test_v24_intermediates_pop_top():
    params = get_env_params()
    now_ts = 1_700_000_000_000
    sample = {
        "track_id": "t1",
        "name": "Test",
        "popularity": 100,
        "comment_count": 50000,
        "publish_time": now_ts - 30 * 86400 * 1000,
    }
    out = compute_v2_intermediates(sample, params, now_ts)
    assert out["pop_term"] >= 1.0
    assert out["pop_top"] == pytest.approx(0.35, abs=1e-6)
    assert out["cmt_term"] == pytest.approx(1.0, abs=1e-6)


def test_days_smoothing_and_fresh_factor():
    params = get_env_params()
    now_ts = 1_700_000_000_000
    sample = {
        "track_id": "t2",
        "name": "Another Song",
        "popularity": 100,
        "comment_count": 100,
        "publish_time": now_ts - 10 * 86400 * 1000,
    }
    out = compute_v2_intermediates(sample, params, now_ts)
    assert out["days_for_rate"] == pytest.approx(13.0, abs=1e-6)
    assert out["plays_per_day"] == pytest.approx(100 / 13.0, abs=1e-6)
    assert out["comments_per_day"] == pytest.approx(100 / 13.0, abs=1e-6)
    expected_fresh = math.exp(-10 / params["HEAT_FRESH_HALFLIFE_DAYS"])
    assert out["fresh_factor"] == pytest.approx(expected_fresh, abs=1e-6)


def test_repeat_fetch_metrics_handles_errors():
    def fake_fetch(_track_id):
        raise RuntimeError("boom")

    out = repeat_fetch_metrics("t1", "Song", 2, fake_fetch)
    assert out["failed"] == 1
    assert out["same_popularity"] == 0
    assert out["same_comment"] == 0
    assert "boom" in (out["error_reason"] or "")



def test_build_top20_breakdown_sorted():
    rows = [
        {"track_id": "a", "name": "A", "popularity": 1, "comment_count": 1, "pop_term": 0.1, "cmt_term": 0.1, "pop_top": 0.0, "raw": 1.0, "heat_10_raw": 2.0, "heat_score_raw": 2.0},
        {"track_id": "b", "name": "B", "popularity": 1, "comment_count": 1, "pop_term": 0.2, "cmt_term": 0.2, "pop_top": 0.0, "raw": 2.0, "heat_10_raw": 3.0, "heat_score_raw": 3.0},
    ]
    out = build_top20_breakdown(rows, limit=1)
    assert out[0]["track_id"] == "b"
