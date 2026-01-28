import math
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.services.scoring import compute_heat_score


def test_heat_score_low_metrics():
    metrics = {
        "play_count": 0,
        "comment_count": 0,
        "liked_count": 0,
        "share_count": 0,
        "publish_time": None,
    }
    result = compute_heat_score(metrics, debug=True)
    assert 1 <= result["heat_score"] <= 2


def test_heat_score_mid_metrics():
    metrics = {
        "play_count": 10**12,
        "comment_count": 10**9,
        "liked_count": 10**10,
        "share_count": 10**8,
        "publish_time": None,
    }
    result = compute_heat_score(metrics, debug=True)
    assert 5 <= result["heat_score"] <= 6


def test_heat_score_high_metrics():
    metrics = {
        "play_count": 10**90,
        "comment_count": 10**80,
        "liked_count": 10**85,
        "share_count": 10**70,
        "publish_time": None,
    }
    result = compute_heat_score(metrics, debug=True)
    assert 8 <= result["heat_score"] <= 10


def test_weight_reallocation_missing_like_share():
    metrics = {
        "play_count": 50000,
        "comment_count": 500,
        "liked_count": None,
        "share_count": None,
        "publish_time": None,
    }
    result = compute_heat_score(metrics, debug=True)
    weights = result["breakdown"]["weights_used"]
    assert "liked_count" not in weights
    assert "share_count" not in weights
    assert sum(weights.values()) == pytest.approx(1.0, abs=1e-6)


def test_proxy_play_count_used_when_missing_play():
    metrics = {
        "play_count": 0,
        "comment_count": 100,
        "liked_count": 200,
        "share_count": 10,
        "publish_time": None,
    }
    result = compute_heat_score(metrics, debug=True)
    breakdown = result["breakdown"]
    assert breakdown["play_is_proxy"] is True
    assert breakdown["proxy_play"] == 100 * 200 + 200 * 10 + 10 * 50


def test_missing_publish_time_still_works():
    metrics = {
        "play_count": 10000,
        "comment_count": 120,
        "liked_count": 300,
        "share_count": 10,
        "publish_time": None,
    }
    result = compute_heat_score(metrics, debug=True)
    assert result["heat_score"] >= 1


def test_momentum_boosts_new_club_hit():
    now_ts = 1_700_000_000_000
    metrics = {
        "play_count": 10**13,
        "comment_count": 5 * 10**10,
        "liked_count": 8 * 10**10,
        "share_count": 10**10,
        "publish_time": now_ts - 7 * 86400 * 1000,
    }
    result = compute_heat_score(metrics, now_ts=now_ts, debug=True)
    legacy_metrics = dict(metrics)
    legacy_metrics["publish_time"] = None
    legacy = compute_heat_score(legacy_metrics, now_ts=now_ts, debug=True)
    assert result["heat_score"] >= 5
    assert result["heat_score"] >= legacy["heat_score"]
    assert result["heat_score_raw"] >= legacy["heat_score_raw"]


def test_classic_song_stays_high():
    now_ts = 1_700_000_000_000
    metrics = {
        "play_count": 10**27,
        "comment_count": 10**24,
        "liked_count": 10**25,
        "share_count": 10**23,
        "publish_time": now_ts - 700 * 86400 * 1000,
    }
    result = compute_heat_score(metrics, now_ts=now_ts, debug=True)
    assert result["heat_score"] >= 6


def test_missing_publish_time_momentum_defaults():
    metrics = {
        "play_count": 25000,
        "comment_count": 400,
        "liked_count": 1200,
        "share_count": 60,
        "publish_time": None,
    }
    result = compute_heat_score(metrics, debug=True)
    breakdown = result["breakdown"]
    assert breakdown["momentum"]["momentum_raw"] == 0.0
    assert breakdown["fusion"]["w_momentum"] == pytest.approx(0.15, abs=1e-4)


def test_disable_momentum_uses_lifetime_only():
    now_ts = 1_700_000_000_000
    metrics = {
        "play_count": 10**9,
        "comment_count": 10**6,
        "liked_count": 10**7,
        "share_count": 10**5,
        "publish_time": now_ts - 7 * 86400 * 1000,
    }
    result = compute_heat_score(metrics, now_ts=now_ts, debug=True, enable_momentum=False)
    breakdown = result["breakdown"]
    assert breakdown["fusion"]["w_momentum"] == pytest.approx(0.0, abs=1e-6)
    assert breakdown["final_fused_raw"] == pytest.approx(
        breakdown["lifetime_final_raw"], abs=1e-6
    )


def test_v2_new_club_hot():
    now_ts = 1_700_000_000_000
    metrics = {
        "play_count": 0,
        "comment_count": 400,
        "liked_count": 0,
        "share_count": 0,
        "publish_time": now_ts - 7 * 86400 * 1000,
        "_popularity": 85,
        "_raw_title": "Song (Remix)",
        "_cleaned_title": "song remix",
    }
    result = compute_heat_score(metrics, now_ts=now_ts, debug=True)
    assert result["breakdown"]["mode"] == "pop_comment_v2"
    assert result["heat_score"] >= 3


def test_v2_new_song_within_180_days():
    now_ts = 1_700_000_000_000
    base_metrics = {
        "play_count": 0,
        "comment_count": 180,
        "liked_count": 0,
        "share_count": 0,
        "_popularity": 70,
    }
    metrics_150 = dict(base_metrics)
    metrics_150["publish_time"] = now_ts - 150 * 86400 * 1000
    metrics_30 = dict(base_metrics)
    metrics_30["publish_time"] = now_ts - 30 * 86400 * 1000
    result_150 = compute_heat_score(metrics_150, now_ts=now_ts, debug=True)
    result_30 = compute_heat_score(metrics_30, now_ts=now_ts, debug=True)
    assert result_150["breakdown"]["v2"]["fresh_factor"] == pytest.approx(
        math.exp(-150 / 180.0), abs=1e-4
    )
    assert abs(result_150["heat_score"] - result_30["heat_score"]) <= 1


def test_v2_old_song_just_over_window():
    now_ts = 1_700_000_000_000
    metrics = {
        "play_count": 0,
        "comment_count": 180,
        "liked_count": 0,
        "share_count": 0,
        "publish_time": now_ts - 181 * 86400 * 1000,
        "_popularity": 70,
    }
    result = compute_heat_score(metrics, now_ts=now_ts, debug=True)
    fresh = result["breakdown"]["v2"]["fresh_factor"]
    assert fresh == pytest.approx(math.exp(-181 / 180.0), abs=1e-4)


def test_v2_classic_high_pop_old():
    now_ts = 1_700_000_000_000
    metrics = {
        "play_count": 0,
        "comment_count": 2000,
        "liked_count": 0,
        "share_count": 0,
        "publish_time": now_ts - 700 * 86400 * 1000,
        "_popularity": 95,
    }
    result = compute_heat_score(metrics, now_ts=now_ts, debug=True)
    assert result["heat_score"] >= 3
    assert result["heat_score"] <= 9


def test_v2_low_pop_low_comment():
    now_ts = 1_700_000_000_000
    metrics = {
        "play_count": 0,
        "comment_count": 3,
        "liked_count": 0,
        "share_count": 0,
        "publish_time": now_ts - 30 * 86400 * 1000,
        "_popularity": 10,
    }
    result = compute_heat_score(metrics, now_ts=now_ts, debug=True)
    assert result["heat_score"] <= 4


def test_v2_new_song_floor_150d_should_raise():
    now_ts = 1_700_000_000_000
    metrics = {
        "play_count": 0,
        "comment_count": 180,
        "liked_count": 0,
        "share_count": 0,
        "publish_time": now_ts - 150 * 86400 * 1000,
        "_popularity": 70,
    }
    result = compute_heat_score(metrics, now_ts=now_ts, debug=True)
    breakdown = result["breakdown"]["v2"]["new_song_floor"]
    assert breakdown["triggered"] is True
    assert result["heat_score"] >= 4
    assert result["heat_score_raw"] >= breakdown["after_heat_10_raw"]


def test_v2_low_track_should_not_raise():
    now_ts = 1_700_000_000_000
    metrics = {
        "play_count": 0,
        "comment_count": 3,
        "liked_count": 0,
        "share_count": 0,
        "publish_time": now_ts - 30 * 86400 * 1000,
        "_popularity": 10,
    }
    result = compute_heat_score(metrics, now_ts=now_ts, debug=True)
    assert result["heat_score"] <= 4


def test_v2_days_smoothing_affects_rates():
    now_ts = 1_700_000_000_000
    metrics = {
        "play_count": 0,
        "comment_count": 100,
        "liked_count": 0,
        "share_count": 0,
        "publish_time": now_ts - 10 * 86400 * 1000,
        "_popularity": 100,
    }
    result = compute_heat_score(metrics, now_ts=now_ts, debug=True)
    rates = result["breakdown"]["momentum"]["rates_per_day"]
    assert rates["plays_per_day"] == pytest.approx(100 / (10 + 3), abs=1e-4)
    assert rates["comments_per_day"] == pytest.approx(100 / (10 + 3), abs=1e-4)


def test_v2_comment_confidence_gate():
    now_ts = 1_700_000_000_000
    metrics = {
        "play_count": 0,
        "comment_count": 50,
        "liked_count": 0,
        "share_count": 0,
        "publish_time": now_ts - 30 * 86400 * 1000,
        "_popularity": 15,
    }
    result = compute_heat_score(metrics, now_ts=now_ts, debug=True)
    v2 = result["breakdown"]["v2"]
    cmt_norm = math.log1p(50) / math.log1p(50000)
    cmt_norm = min(max(cmt_norm, 0.0), 1.2)
    cmt_term = cmt_norm ** 1.15
    expected_lifetime_raw = 0.6 * 0.0 + 0.4 * cmt_term
    assert v2["lifetime_raw_v2"] == pytest.approx(expected_lifetime_raw, abs=1e-4)



def test_pop_comment_v24_formula(monkeypatch):
    monkeypatch.setenv("POP_GAMMA", "1.6")
    monkeypatch.setenv("P0", "15")
    monkeypatch.setenv("TOP_START", "95")
    monkeypatch.setenv("TOP_BOOST", "0.35")
    monkeypatch.setenv("BONUS_MAX", "2.0")
    monkeypatch.setenv("COMMENT_SHAPE", "1.6")
    monkeypatch.setenv("X0", "3.477")
    monkeypatch.setenv("X1", "4.477")
    monkeypatch.setenv("COMMENT_REF", "50000")
    monkeypatch.setenv("COMMENT_GAMMA", "1.15")
    monkeypatch.setenv("POP_WEIGHT", "0.60")
    monkeypatch.setenv("CMT_WEIGHT", "0.40")
    monkeypatch.setenv("RAW_SCALE", "8.0")
    monkeypatch.setenv("HEAT_POP_BASELINE", "15")

    metrics = {
        "play_count": 0,
        "comment_count": 50000,
        "liked_count": 0,
        "share_count": 0,
        "_popularity": 100,
        "_raw_title": "Test",
        "_cleaned_title": "Test",
    }
    result = compute_heat_score(metrics, debug=True)
    v2 = result["breakdown"]["v2"]
    assert v2["PopTerm"] == pytest.approx(1.0, abs=1e-4)
    assert v2["CmtTerm"] == pytest.approx(1.0, abs=1e-4)
    assert v2["p_top"] == pytest.approx(0.35, abs=1e-4)
    assert v2["raw"] == pytest.approx(1.0, abs=1e-2)
    assert v2["R"] == pytest.approx(8.0, abs=1e-2)
    assert v2["heat10"] == pytest.approx(10.0, abs=1e-2)


def test_v4_popcomment_base_bonus_low_pop(monkeypatch):
    monkeypatch.setenv("P0", "15")
    monkeypatch.setenv("TOP_START", "95")
    monkeypatch.setenv("TOP_BOOST", "0.35")
    monkeypatch.setenv("BONUS_MAX", "2.0")
    monkeypatch.setenv("COMMENT_SHAPE", "1.6")
    monkeypatch.setenv("X0", "3.477")
    monkeypatch.setenv("X1", "4.477")
    metrics = {
        "play_count": 0,
        "comment_count": 5000,
        "liked_count": 0,
        "share_count": 0,
        "_popularity": 70,
        "_raw_title": "Test",
        "_cleaned_title": "Test",
    }
    result = compute_heat_score(metrics, debug=True)
    v2 = result["breakdown"]["v2"]
    assert v2["pop_gate"] == pytest.approx(0.0, abs=1e-4)
    assert v2["Bonus"] == pytest.approx(0.0, abs=1e-4)
    assert v2["Base"] == pytest.approx(v2["heat10"], abs=1e-4)



def test_v4_popcomment_base_bonus_high_pop(monkeypatch):
    monkeypatch.setenv("P0", "15")
    monkeypatch.setenv("TOP_START", "95")
    monkeypatch.setenv("TOP_BOOST", "0.35")
    monkeypatch.setenv("BONUS_MAX", "2.0")
    monkeypatch.setenv("COMMENT_SHAPE", "1.6")
    monkeypatch.setenv("X0", "3.477")
    monkeypatch.setenv("X1", "4.477")
    metrics_low = {
        "play_count": 0,
        "comment_count": 5000,
        "liked_count": 0,
        "share_count": 0,
        "_popularity": 70,
        "_raw_title": "Test",
        "_cleaned_title": "Test",
    }
    metrics_high = {
        "play_count": 0,
        "comment_count": 5000,
        "liked_count": 0,
        "share_count": 0,
        "_popularity": 100,
        "_raw_title": "Test",
        "_cleaned_title": "Test",
    }
    low = compute_heat_score(metrics_low, debug=True)["breakdown"]["v2"]
    high = compute_heat_score(metrics_high, debug=True)["breakdown"]["v2"]
    assert high["pop_gate"] == pytest.approx(1.0, abs=1e-4)
    assert high["Bonus"] >= 0.0
    assert high["heat10"] >= low["heat10"]

