from __future__ import annotations

import difflib
import re
import math
import os
import time
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

from .cleaning import detect_version_tokens, normalize_query_text, normalize_similarity_text
from ..clients.base import Candidate

try:
    from rapidfuzz import fuzz  # type: ignore

    def _similarity(a: str, b: str) -> float:
        if not a or not b:
            return 0.0
        return fuzz.token_set_ratio(a, b) / 100.0

except Exception:  # pragma: no cover

    def _similarity(a: str, b: str) -> float:
        if not a or not b:
            return 0.0
        return difflib.SequenceMatcher(None, a, b).ratio()


@dataclass
class InputTrack:
    clean_title: str
    clean_artist: str
    query_title: str
    query_artist: str
    duration_ms: Optional[int]
    feat_artists: List[str]
    dj_edit_mode: bool


@dataclass
class ScoredCandidate:
    candidate: Candidate
    score: float
    details: dict


def _feat_similarity(input_track: InputTrack, candidate: Candidate) -> float:
    if not input_track.feat_artists:
        return 0.0
    haystack = normalize_query_text(f"{candidate.title} {candidate.artist}")
    hit = any(normalize_query_text(name) in haystack for name in input_track.feat_artists)
    return 1.0 if hit else 0.0


def _feat_bonus(input_track: InputTrack, candidate: Candidate) -> float:
    if not input_track.feat_artists:
        return 0.0
    return 0.05 if _feat_similarity(input_track, candidate) > 0 else 0.0


def _duration_score(
    input_track: InputTrack, candidate: Candidate, base_text_score: float
) -> Tuple[float, Optional[int], str, bool]:
    mode = "soft" if input_track.dj_edit_mode else "strict"
    if not input_track.duration_ms or not candidate.duration_ms:
        return 0.0, None, mode, False
    delta = abs(input_track.duration_ms - candidate.duration_ms)
    if input_track.dj_edit_mode:
        if delta <= 8000:
            return 1.0, delta, mode, False
        if delta <= 15000:
            score = 1.0 - ((delta - 8000) / 7000.0) * 0.7
            base = max(0.3, score)
            override = False
            if base_text_score >= 0.82 and base < 0.15:
                base = 0.15
                override = True
            return base, delta, mode, override
        base = 0.0
        override = False
        if base_text_score >= 0.82:
            base = max(base, 0.15)
            override = True
        return base, delta, mode, override
    if delta <= 2000:
        return 1.0, delta, mode, False
    if delta <= 5000:
        score = 1.0 - ((delta - 2000) / 3000.0) * 0.7
        base = max(0.3, score)
        override = False
        if base_text_score >= 0.82 and base < 0.15:
            base = 0.15
            override = True
        return base, delta, mode, override
    base = 0.0
    override = False
    if base_text_score >= 0.82:
        base = max(base, 0.15)
        override = True
    return base, delta, mode, override


def score_candidate(input_track: InputTrack, candidate: Candidate) -> Tuple[float, dict]:
    title_a = normalize_similarity_text(input_track.query_title)
    title_b = normalize_similarity_text(candidate.title)
    feat_strip_re = re.compile(r"(?i)\s*\(?\b(feat\.?|ft\.?|featuring|with)\b.*$")
    stripped_title = feat_strip_re.sub("", candidate.title).strip()
    stripped_title_b = normalize_similarity_text(stripped_title) if stripped_title else ""
    artist_a = normalize_similarity_text(input_track.query_artist)
    artist_b = normalize_similarity_text(candidate.artist)

    title_sim = _similarity(title_a, title_b)
    if stripped_title_b and stripped_title_b != title_b:
        title_sim = max(title_sim, _similarity(title_a, stripped_title_b))
    artist_sim = _similarity(artist_a, artist_b) if artist_a and artist_b else 0.0
    feat_sim = _feat_similarity(input_track, candidate)
    base_text_score = 0.65 * title_sim + 0.25 * artist_sim + 0.10 * feat_sim

    duration_score, duration_delta, duration_mode, override_applied = _duration_score(
        input_track, candidate, base_text_score
    )

    version_tokens = detect_version_tokens(candidate.title)
    version_penalty = 0.12 if version_tokens else 0.0

    popularity = candidate.popularity or 0.0
    norm_popularity = min(1.0, max(0.0, popularity))
    weight = 0.08 if input_track.dj_edit_mode else 0.05
    popularity_bonus = 0.0
    if base_text_score >= 0.70:
        popularity_bonus = weight * norm_popularity
        if artist_sim < 0.55:
            popularity_bonus *= 0.5

    feat_bonus = _feat_bonus(input_track, candidate)

    score = (
        0.6 * title_sim
        + 0.25 * artist_sim
        + 0.1 * duration_score
        + feat_bonus
        + popularity_bonus
        - version_penalty
    )
    score = max(0.0, min(1.0, score))

    details = {
        "title_similarity": title_sim,
        "title_similarity_stripped": _similarity(title_a, stripped_title_b)
        if stripped_title_b and stripped_title_b != title_b
        else None,
        "artist_similarity": artist_sim,
        "feat_similarity": feat_sim,
        "base_text_score": base_text_score,
        "duration_delta": duration_delta,
        "duration_score": duration_score,
        "duration_mode": duration_mode,
        "duration_override_applied": override_applied,
        "version_penalty": version_penalty,
        "popularity_bonus_value": popularity_bonus,
        "popularity_bonus_applied": popularity_bonus > 0,
        "popularity": norm_popularity,
    }
    return score, details


def select_best_candidate(
    input_track: InputTrack, candidates: List[Candidate]
) -> Tuple[Optional[ScoredCandidate], List[ScoredCandidate], bool, str, dict]:
    scored: List[ScoredCandidate] = []
    for candidate in candidates:
        score, details = score_candidate(input_track, candidate)
        scored.append(ScoredCandidate(candidate=candidate, score=score, details=details))

    scored.sort(
        key=lambda item: (item.score, item.candidate.popularity or 0.0), reverse=True
    )

    if not scored:
        return None, [], False, "NO_CANDIDATES", {
            "trusted_pool_non_empty": False,
            "trusted_pool_pop_rank": None,
            "trusted_pool_pop_top2_close": False,
        }

    decision_rule = "FALLBACK_MAX_SCORE"

    def is_short_title(text: str) -> bool:
        if not text:
            return True
        words = text.split()
        compact = text.replace(" ", "")
        return len(words) <= 4 or len(compact) <= 12

    title_threshold = 0.85 if is_short_title(input_track.query_title) else 0.78
    trusted_pool = [
        item
        for item in scored
        if (item.details.get("title_similarity") or 0.0) >= title_threshold
    ]

    if trusted_pool:
        non_version = [
            item for item in trusted_pool if not detect_version_tokens(item.candidate.title)
        ]
        if non_version:
            trusted_pool = non_version

        def adjusted_base(item: ScoredCandidate) -> float:
            base = float(item.details.get("base_text_score") or 0.0)
            artist_sim = float(item.details.get("artist_similarity") or 0.0)
            if artist_sim < 0.55:
                base -= 0.05
            return base

        trusted_pool.sort(key=adjusted_base, reverse=True)
        best_base = adjusted_base(trusted_pool[0])
        top_base = [item for item in trusted_pool if best_base - adjusted_base(item) < 0.03]

        if top_base:
            title_sim = float(top_base[0].details.get("title_similarity") or 0.0)
            artist_sim = float(top_base[0].details.get("artist_similarity") or 0.0)
            if title_sim >= 0.85 and (
                artist_sim >= 0.60 or (not input_track.query_artist and title_sim >= 0.90)
            ):
                top_base.sort(
                    key=lambda item: item.candidate.popularity or 0.0, reverse=True
                )
                best = top_base[0]
                decision_rule = "DETERMINISTIC_POPULARITY"
            else:
                top_base.sort(
                    key=lambda item: item.candidate.popularity or 0.0, reverse=True
                )
                if len(top_base) > 1:
                    pop_a = top_base[0].candidate.popularity or 0.0
                    pop_b = top_base[1].candidate.popularity or 0.0
                    if abs(pop_a - pop_b) < 0.05:
                        if input_track.dj_edit_mode:
                            best = top_base[0]
                            decision_rule = "TRUSTED_POOL_POPULARITY"
                        else:
                            top_base.sort(
                                key=lambda item: (
                                    item.details.get("duration_delta") or 10**9
                                )
                            )
                            best = top_base[0]
                            decision_rule = "TRUSTED_POOL_DURATION"
                    else:
                        best = top_base[0]
                        decision_rule = "TRUSTED_POOL_POPULARITY"
                else:
                    best = top_base[0]
                    decision_rule = "TRUSTED_POOL_BASE_TEXT"
        else:
            best = scored[0]
    else:
        best = scored[0]

    remix_replaced = False
    if detect_version_tokens(best.candidate.title):
        for alt in scored[1:]:
            if detect_version_tokens(alt.candidate.title):
                continue
            if alt.score >= best.score - 0.03:
                best = alt
                remix_replaced = True
                break

    pop_rank = None
    pop_top2_close = False
    if trusted_pool:
        pop_sorted = sorted(
            trusted_pool, key=lambda item: item.candidate.popularity or 0.0, reverse=True
        )
        if len(pop_sorted) > 1:
            pop_top2_close = abs(
                (pop_sorted[0].candidate.popularity or 0.0)
                - (pop_sorted[1].candidate.popularity or 0.0)
            ) < 0.05
        for idx, item in enumerate(pop_sorted, start=1):
            if item.candidate.track_id == best.candidate.track_id:
                pop_rank = idx
                break

    meta = {
        "trusted_pool_non_empty": bool(trusted_pool),
        "trusted_pool_pop_rank": pop_rank,
        "trusted_pool_pop_top2_close": pop_top2_close,
    }

    return best, scored, remix_replaced, decision_rule, meta
def decision_from_score(score: float) -> str:
    if score >= 0.85:
        return "AUTO_MATCH"
    if score >= 0.7:
        return "NEEDS_REVIEW"
    return "NO_MATCH"


HEAT_WEIGHTS = {
    "play_count": 0.45,
    "comment_count": 0.35,
    "liked_count": 0.15,
    "share_count": 0.05,
}
HEAT_K = 25.0
HEAT_LEVELS = [
    (1, 2, 1, "Cold", "\U0001F9CA"),
    (3, 4, 2, "Warm", "\U0001F642"),
    (5, 6, 3, "Hot", "\U0001F525"),
    (7, 8, 4, "Trending", "\U0001F680"),
    (9, 10, 5, "Viral", "\U0001F4A5"),
]


def _as_int(value: Optional[object]) -> int:
    if value is None:
        return 0
    try:
        return max(0, int(float(value)))
    except (TypeError, ValueError):
        return 0


def _as_float(value: Optional[object]) -> float:
    if value is None:
        return 0.0
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _extract_metric(raw: Dict, keys: List[str]) -> Tuple[Optional[object], bool]:
    if not isinstance(raw, dict):
        return None, False
    containers = [raw]
    for key in ("stats", "statistics", "stat", "meta", "data", "song"):
        nested = raw.get(key)
        if isinstance(nested, dict):
            containers.append(nested)
    for container in containers:
        for key in keys:
            if key in container:
                return container.get(key), container.get(key) is not None
    return None, False


def _extract_publish_time(raw: Dict) -> Tuple[Optional[object], bool]:
    value, present = _extract_metric(
        raw,
        [
            "publishTime",
            "publish_time",
            "publishTimestamp",
            "publish_ts",
            "publishDate",
            "publish_date",
            "releaseTime",
            "release_time",
        ],
    )
    return value, present


def normalize_publish_time(value: Optional[object]) -> Tuple[Optional[int], Optional[str]]:
    if value in (None, 0, "0"):
        return None, None
    try:
        ts = int(float(value))
    except (TypeError, ValueError):
        return None, None
    if ts <= 0:
        return None, None
    if ts < 10**12:
        return ts * 1000, "s"
    return ts, "ms"


def normalize_netease_metrics(raw: Dict) -> Dict[str, object]:
    if not isinstance(raw, dict):
        raw = {}
    if isinstance(raw.get("songs"), list) and raw["songs"]:
        raw = raw["songs"][0]
    elif isinstance(raw.get("data"), dict) and isinstance(raw["data"].get("songs"), list):
        songs = raw["data"]["songs"]
        if songs:
            raw = songs[0]

    play_raw, play_present = _extract_metric(
        raw, ["play_count", "playCount", "playcount", "play", "plays", "listenCount"]
    )
    comment_raw, comment_present = _extract_metric(
        raw, ["comment_count", "commentCount", "comment", "comments", "commentCnt"]
    )
    like_raw, like_present = _extract_metric(
        raw,
        [
            "liked_count",
            "likedCount",
            "likeCount",
            "liked",
            "collectCount",
            "favCount",
            "subscribedCount",
        ],
    )
    share_raw, share_present = _extract_metric(
        raw, ["share_count", "shareCount", "share", "shares", "shareCnt"]
    )
    publish_raw, publish_present = _extract_publish_time(raw)
    pop_raw, _ = _extract_metric(raw, ["pop", "popularity"])
    publish_time, publish_unit = normalize_publish_time(publish_raw)

    metrics = {
        "play_count": _as_int(play_raw),
        "comment_count": _as_int(comment_raw),
        "liked_count": _as_int(like_raw),
        "share_count": _as_int(share_raw),
        "publish_time": publish_time,
        "_popularity": _as_float(pop_raw),
        "_publish_time_unit": publish_unit,
        "_present_fields": {
            "play_count": play_present,
            "comment_count": comment_present,
            "liked_count": like_present,
            "share_count": share_present,
            "publish_time": publish_present,
        },
    }
    return metrics


def _normalize_weights(metrics: Dict[str, object]) -> Dict[str, float]:
    present_fields = metrics.get("_present_fields")
    play_proxy = bool(metrics.get("_play_is_proxy"))
    available: Dict[str, bool] = {}
    for key in HEAT_WEIGHTS:
        value = metrics.get(key)
        if isinstance(present_fields, dict):
            available[key] = bool(present_fields.get(key)) and value is not None
        else:
            available[key] = value is not None
    if play_proxy:
        available["play_count"] = True
    active_weights = {k: w for k, w in HEAT_WEIGHTS.items() if available.get(k)}
    total = sum(active_weights.values())
    if total <= 0:
        return {}
    return {k: w / total for k, w in active_weights.items()}


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _resolve_heat_level(score: int) -> Tuple[int, str, str]:
    heat_level = 1
    heat_label = "Cold"
    heat_badge = "\U0001F9CA"
    for low, high, level, label, badge in HEAT_LEVELS:
        if low <= score <= high:
            heat_level = level
            heat_label = label
            heat_badge = badge
            break
    return heat_level, heat_label, heat_badge



def _env_flag(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


def _env_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return float(raw)
    except (TypeError, ValueError):
        return default


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return int(float(raw))
    except (TypeError, ValueError):
        return default


def compute_heat_score(
    metrics: Dict[str, object],
    now_ts: Optional[int] = None,
    debug: bool = False,
    enable_momentum: Optional[bool] = None,
    momentum_scale: Optional[float] = None,
) -> Dict[str, object]:
    now_ts_ms = int(now_ts or time.time() * 1000)
    if now_ts_ms < 10**12:
        now_ts_ms *= 1000
    if enable_momentum is None:
        enable_momentum = _env_flag("HEAT_ENABLE_MOMENTUM", True)
    if momentum_scale is None:
        momentum_scale = _env_float("HEAT_MOMENTUM_SCALE", 1.0)
    if momentum_scale <= 0:
        momentum_scale = 1.0
    normalized = {
        "play_count": _as_int(metrics.get("play_count")),
        "comment_count": _as_int(metrics.get("comment_count")),
        "liked_count": _as_int(metrics.get("liked_count")),
        "share_count": _as_int(metrics.get("share_count")),
        "publish_time": metrics.get("publish_time"),
    }
    raw_title = str(metrics.get("_raw_title") or "")
    cleaned_title = str(metrics.get("_cleaned_title") or "")
    play_is_proxy = False
    proxy_reason = None
    proxy_play = 0
    if normalized["play_count"] == 0 and (
        normalized["comment_count"] > 0
        or normalized["liked_count"] > 0
        or normalized["share_count"] > 0
    ):
        proxy_play = (
            normalized["comment_count"] * 200
            + normalized["liked_count"] * 10
            + normalized["share_count"] * 50
        )
        play_is_proxy = True
        proxy_reason = "interaction"
    popularity = _as_float(metrics.get("_popularity"))
    if not play_is_proxy and normalized["play_count"] == 0:
        try:
            popularity_value = float(popularity or 0.0)
        except (TypeError, ValueError):
            popularity_value = 0.0
        if popularity_value > 0:
            proxy_play = int(popularity_value * 100000)
            play_is_proxy = True
            proxy_reason = "popularity"

    weight_metrics = dict(metrics)
    if play_is_proxy:
        weight_metrics["_play_is_proxy"] = True
    weights_used = _normalize_weights(weight_metrics)
    base_raw = 0.0
    scoring_metrics = dict(normalized)
    if play_is_proxy:
        scoring_metrics["play_count"] = proxy_play
    for key, weight in weights_used.items():
        base_raw += weight * math.log1p(scoring_metrics.get(key, 0))

    recency_boost = None
    recency_factor = None
    days_since = None
    publish_time_ms = normalized.get("publish_time")
    if publish_time_ms:
        days_since = max(0.0, (now_ts_ms - int(publish_time_ms)) / 86400000.0)

    insufficient_fields = (
        normalized["play_count"] == 0
        and normalized["liked_count"] == 0
        and normalized["share_count"] == 0
        and (popularity > 0 or normalized["comment_count"] > 0)
    )
    mode = "pop_comment_v2" if insufficient_fields else "full"
    club_tokens = ("remix", "edit", "bootleg", "vip", "flip", "mashup", "rework")
    title_blob = f"{raw_title} {cleaned_title}".lower()
    club_boost = any(token in title_blob for token in club_tokens)

    if mode == "pop_comment_v2":
        club_boost = False
        pop_baseline = _env_float("HEAT_POP_BASELINE", 15.0)
        p0 = _env_float("P0", 15.0)
        pop_gamma = _env_float("POP_GAMMA", 1.6)
        top_start = _env_float("TOP_START", 95.0)
        top_boost = _env_float("TOP_BOOST", 0.35)
        bonus_max = _env_float("BONUS_MAX", 2.0)
        comment_shape = _env_float("COMMENT_SHAPE", 1.6)
        x0 = _env_float("X0", 3.477)
        x1 = _env_float("X1", 4.477)
        heat_gate_9_pop_min = _env_float("HEAT_GATE_9_POP_MIN", 98.0)
        heat_gate_9_comment_min = _env_float("HEAT_GATE_9_COMMENT_MIN", 12000.0)
        heat_gate_10_pop_min = _env_float("HEAT_GATE_10_POP_MIN", 100.0)
        heat_gate_10_comment_min = _env_float("HEAT_GATE_10_COMMENT_MIN", 30000.0)
        comment_ref = _env_float("COMMENT_REF", 50000.0)
        comment_gamma = _env_float("COMMENT_GAMMA", 1.15)
        pop_weight = _env_float("POP_WEIGHT", 0.60)
        comment_weight = _env_float("CMT_WEIGHT", 0.40)
        raw_scale = _env_float("RAW_SCALE", 8.0)
        momentum_min = _env_float("HEAT_MOMENTUM_WEIGHT_MIN", 0.25)
        momentum_max = _env_float("HEAT_MOMENTUM_WEIGHT_MAX", 0.75)
        new_song_window_days = _env_int("NEW_SONG_WINDOW_DAYS", 180)
        fresh_halflife_days = _env_float("HEAT_FRESH_HALFLIFE_DAYS", 180.0)
        new_song_floor_raw = _env_float("HEAT_NEW_SONG_FLOOR_RAW", 4.8)
        new_song_floor_pop_min = _env_float("HEAT_NEW_SONG_FLOOR_POP_MIN", 35.0)
        new_song_floor_comment_min = _env_float("HEAT_NEW_SONG_FLOOR_COMMENT_MIN", 20.0)

        pop_denominator = max(100.0 - p0, 1.0)
        pop_norm = _clamp((popularity - p0) / pop_denominator, 0.0, 1.0)
        pop_base = pop_norm**pop_gamma
        top_denominator = max(100.0 - top_start, 1.0)
        top_zone = _clamp((popularity - top_start) / top_denominator, 0.0, 1.0)
        pop_top = top_boost * (top_zone**2)
        pop_term = _clamp(pop_base + pop_top, 0.0, 1.0)
        base = 1.0 + 7.0 * pop_term

        comment_norm = 0.0
        if comment_ref > 0:
            comment_norm = math.log1p(normalized["comment_count"]) / math.log1p(comment_ref)
        comment_norm = _clamp(comment_norm, 0.0, 1.2)
        cmt_term = comment_norm**comment_gamma
        lifetime_raw = pop_weight * pop_term + comment_weight * cmt_term
        x = math.log10(normalized["comment_count"] + 1)
        denom_x = max(x1 - x0, 1e-6)
        t = _clamp((x - x0) / denom_x, 0.0, 1.0)
        t2 = t**comment_shape
        bonus = bonus_max * t2
        pop_gate = _clamp((popularity - 95.0) / 5.0, 0.0, 1.0)
        bonus *= pop_gate
        heat10_base_bonus = _clamp(base + bonus, 1.0, 10.0)
        ten_gate_pass = (popularity >= heat_gate_10_pop_min and normalized["comment_count"] >= heat_gate_10_comment_min)
        nine_gate_pass = (popularity >= heat_gate_9_pop_min and normalized["comment_count"] >= heat_gate_9_comment_min)
        if heat10_base_bonus >= 10.0 and not ten_gate_pass:
            heat10_base_bonus = 9.94
        if heat10_base_bonus >= 9.0 and not nine_gate_pass:
            heat10_base_bonus = 8.94

        if days_since is None:
            momentum_raw = 0.0
            fresh_factor = 0.0
            denom_days = None
            plays_per_day = 0.0
            comments_per_day = 0.0
            likes_per_day = 0.0
            shares_per_day = 0.0
        else:
            days = max(days_since + 3.0, 1.0)
            denom_days = days
            plays_per_day = popularity / days
            comments_per_day = normalized["comment_count"] / days
            likes_per_day = 0.0
            shares_per_day = 0.0
            pop_rate_term = math.log1p(plays_per_day) ** pop_gamma
            comment_rate_norm = 0.0
            if comment_ref > 0:
                comment_rate_norm = math.log1p(comments_per_day) / math.log1p(comment_ref)
            comment_rate_norm = _clamp(comment_rate_norm, 0.0, 1.2)
            comment_rate_term = comment_rate_norm**comment_gamma
            momentum_raw = pop_weight * pop_rate_term + comment_weight * comment_rate_term
            fresh_factor = math.exp(-days_since / max(fresh_halflife_days, 1.0))

        w_momentum = _clamp(
            momentum_min + (momentum_max - momentum_min) * fresh_factor,
            momentum_min,
            momentum_max,
        )
        w_lifetime = 1.0 - w_momentum
        final_fused_raw = lifetime_raw * raw_scale
        recency_boost = None
        recency_factor = None
    else:
        if publish_time_ms:
            recency_boost = math.exp(-days_since / 180.0)
            recency_factor = 0.7 + 0.3 * recency_boost
            lifetime_raw = base_raw * recency_factor
        else:
            lifetime_raw = base_raw

        if not enable_momentum:
            denom_days = None
            plays_per_day = 0.0
            comments_per_day = 0.0
            likes_per_day = 0.0
            shares_per_day = 0.0
            momentum_raw = 0.0
            fresh_factor = 0.0
            w_momentum = 0.0
            w_lifetime = 1.0
        else:
            if days_since is None:
                denom_days = None
                plays_per_day = 0.0
                comments_per_day = 0.0
                likes_per_day = 0.0
                shares_per_day = 0.0
                momentum_raw = 0.0
            else:
                denom_days = max(days_since, 1.0)
                plays_per_day = scoring_metrics.get("play_count", 0) / denom_days
                comments_per_day = scoring_metrics.get("comment_count", 0) / denom_days
                likes_per_day = scoring_metrics.get("liked_count", 0) / denom_days
                shares_per_day = scoring_metrics.get("share_count", 0) / denom_days
                momentum_raw = 0.0
                for key, weight in weights_used.items():
                    if key == "play_count":
                        value = plays_per_day * momentum_scale
                    elif key == "comment_count":
                        value = comments_per_day * momentum_scale
                    elif key == "liked_count":
                        value = likes_per_day * momentum_scale
                    elif key == "share_count":
                        value = shares_per_day * momentum_scale
                    else:
                        value = 0.0
                    momentum_raw += weight * math.log1p(value)

            fresh_factor = math.exp(-days_since / 30.0) if days_since is not None else 0.0
            w_momentum = _clamp(0.15 + 0.55 * fresh_factor, 0.15, 0.70)
            w_lifetime = 1.0 - w_momentum

        final_fused_raw = w_lifetime * lifetime_raw + w_momentum * momentum_raw

    if mode == "pop_comment_v2":
        heat_10_raw = heat10_base_bonus
    else:
        heat_10_raw = (
            1.0 + 9.0 * final_fused_raw / (final_fused_raw + HEAT_K)
            if final_fused_raw >= 0
            else 1.0
        )
    floor_enabled = False
    floor_triggered = False
    floor_before_heat_10 = heat_10_raw
    floor_after_heat_10 = heat_10_raw
    if mode == "pop_comment_v2":
        floor_enabled = True
        if days_since is not None and days_since <= new_song_window_days and (
            popularity >= new_song_floor_pop_min
            or normalized["comment_count"] >= new_song_floor_comment_min
        ):
            floor_triggered = True
            heat_10_raw = max(heat_10_raw, new_song_floor_raw)
            floor_after_heat_10 = heat_10_raw
    heat_score = int(math.floor(_clamp(heat_10_raw, 1.0, 10.0) + 1e-9))
    heat_score_raw = round(_clamp(heat_10_raw, 1.0, 10.0), 2)

    heat_level, heat_label, heat_badge = _resolve_heat_level(heat_score)

    breakdown = {
        "mode": mode,
        "normalized_metrics": normalized,
        "weights_used": weights_used,
        "publish_time_unit": metrics.get("_publish_time_unit"),
        "days_since_publish": None if days_since is None else round(days_since, 2),
        "play_is_proxy": play_is_proxy,
        "proxy_play": proxy_play if play_is_proxy else None,
        "proxy_reason": proxy_reason,
        "popularity": popularity if popularity is not None else None,
        "base_raw": round(base_raw, 4),
        "recency_boost": None if recency_boost is None else round(recency_boost, 4),
        "final_raw": round(lifetime_raw, 4),
        "lifetime_final_raw": round(lifetime_raw, 4),
        "final_fused_raw": round(final_fused_raw, 4),
        "heat_10_raw": round(heat_10_raw, 4),
        "final_heat_score": heat_score,
        "momentum": {
            "rates_per_day": {
                "plays_per_day": round(plays_per_day, 4),
                "comments_per_day": round(comments_per_day, 4),
                "likes_per_day": round(likes_per_day, 4),
                "shares_per_day": round(shares_per_day, 4),
            },
            "momentum_raw": round(momentum_raw, 4),
        },
        "fusion": {
            "momentum_enabled": bool(enable_momentum),
            "momentum_scale": round(momentum_scale, 4),
            "fresh_factor": round(fresh_factor, 4),
            "w_momentum": round(w_momentum, 4),
            "w_lifetime": round(w_lifetime, 4),
            "lifetime_raw": round(lifetime_raw, 4),
            "momentum_raw": round(momentum_raw, 4),
            "final_fused_raw": round(final_fused_raw, 4),
        },
    }

    if mode == "pop_comment_v2":
        breakdown["scales"] = {
            "pop_baseline": round(pop_baseline, 4),
            "pop_gamma": round(pop_gamma, 4),
            "top_start": round(top_start, 4),
            "top_boost": round(top_boost, 4),
            "comment_ref": round(comment_ref, 4),
            "comment_gamma": round(comment_gamma, 4),
            "pop_weight": round(pop_weight, 4),
            "comment_weight": round(comment_weight, 4),
            "p0": round(p0, 4),
            "top_start": round(top_start, 4),
            "top_boost": round(top_boost, 4),
            "bonus_max": round(bonus_max, 4),
            "comment_shape": round(comment_shape, 4),
            "x0": round(x0, 4),
            "x1": round(x1, 4),
            "heat_gate_9_pop_min": round(heat_gate_9_pop_min, 4),
            "heat_gate_9_comment_min": round(heat_gate_9_comment_min, 4),
            "heat_gate_10_pop_min": round(heat_gate_10_pop_min, 4),
            "heat_gate_10_comment_min": round(heat_gate_10_comment_min, 4),
            "raw_scale": round(raw_scale, 4),
            "momentum_weight_min": round(momentum_min, 4),
            "momentum_weight_max": round(momentum_max, 4),
            "new_song_window_days": int(new_song_window_days),
            "fresh_halflife_days": round(fresh_halflife_days, 4),
        }
        breakdown["v2"] = {
            "popularity": round(popularity, 4),
            "comment_count": normalized["comment_count"],
            "pop_baseline": round(pop_baseline, 4),
            "pop_gamma": round(pop_gamma, 4),
            "comment_ref": round(comment_ref, 4),
            "comment_gamma": round(comment_gamma, 4),
            "PopTerm": round(pop_term, 4),
            "CmtTerm": round(cmt_term, 4),
            "p_top": round(pop_top, 4),
            "Base": round(base, 4),
            "Bonus": round(bonus, 4),
            "pop_gate": round(pop_gate, 4),
            "t": round(t, 4),
            "t2": round(t2, 4),
            "x": round(x, 4),
            "nine_gate_pass": bool(nine_gate_pass),
            "ten_gate_pass": bool(ten_gate_pass),
            "raw": round(lifetime_raw, 4),
            "R": round(final_fused_raw, 4),
            "heat10": round(heat_10_raw, 4),
            "lifetime_raw_v2": round(lifetime_raw, 4),
            "momentum_raw_v2": round(momentum_raw, 4),
            "new_song_window_days": int(new_song_window_days),
            "fresh_halflife_days": round(fresh_halflife_days, 4),
            "fresh_factor": round(fresh_factor, 4),
            "w_momentum": round(w_momentum, 4),
            "w_lifetime": round(w_lifetime, 4),
            "club_boost": bool(club_boost),
            "new_song_floor": {
                "enabled": floor_enabled,
                "raw_floor": round(new_song_floor_raw, 4),
                "pop_min": round(new_song_floor_pop_min, 4),
                "comment_min": round(new_song_floor_comment_min, 4),
                "triggered": floor_triggered,
                "before_heat_10_raw": round(floor_before_heat_10, 4),
                "after_heat_10_raw": round(floor_after_heat_10, 4),
            },
        }

    return {
        "heat_score": heat_score,
        "heat_score_raw": heat_score_raw,
        "heat_level": heat_level,
        "heat_label": heat_label,
        "heat_badge": heat_badge,
        "breakdown": breakdown if debug else breakdown,
    }
