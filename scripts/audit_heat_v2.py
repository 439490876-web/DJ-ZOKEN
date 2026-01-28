#!/usr/bin/env python3
"""Heat v2 audit script.

Runs heat scoring on a batch of samples and exports per-track intermediate values
plus aggregate summaries to help diagnose score clustering (e.g., many 7s).
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import os
import sys
import time
from pathlib import Path
from statistics import mean
from typing import Callable, Dict, Iterable, List, Optional, Tuple

ROOT = Path(__file__).resolve().parents[1]
PYE_ROOT = ROOT / "apps" / "backend" / "PyLyrics-Extractor"
if not (PYE_ROOT / "app").exists():
    alt_root = ROOT.parent.parent
    alt_pye = alt_root / "apps" / "backend" / "PyLyrics-Extractor"
    if (alt_pye / "app").exists():
        PYE_ROOT = alt_pye
if str(PYE_ROOT) not in sys.path:
    sys.path.insert(0, str(PYE_ROOT))


try:
    from dotenv import load_dotenv
    _dotenv_path = (PYE_ROOT / ".env").resolve()
    if _dotenv_path.exists():
        load_dotenv(_dotenv_path)
    else:
        print(f"[audit] .env not found at {_dotenv_path}")
except Exception as exc:
    print(f"[audit] dotenv load skipped: {exc}")

from app.services.scoring import HEAT_K, compute_heat_score, normalize_netease_metrics
from app.services.scoring import _env_float, _env_int

AUDIO_EXTS = {".mp3", ".flac", ".wav", ".m4a", ".aiff", ".aif", ".aac", ".ogg"}


def get_env_params() -> Dict[str, float | int]:
    return {
        "HEAT_POP_BASELINE": _env_float("HEAT_POP_BASELINE", 15.0),
        "P0": _env_float("P0", 15.0),
        "POP_GAMMA": _env_float("POP_GAMMA", 1.6),
        "TOP_START": _env_float("TOP_START", 95.0),
        "TOP_BOOST": _env_float("TOP_BOOST", 0.35),
        "BONUS_MAX": _env_float("BONUS_MAX", 2.0),
        "COMMENT_SHAPE": _env_float("COMMENT_SHAPE", 1.6),
        "X0": _env_float("X0", 3.477),
        "X1": _env_float("X1", 4.477),
        "HEAT_GATE_9_POP_MIN": _env_float("HEAT_GATE_9_POP_MIN", 98.0),
        "HEAT_GATE_9_COMMENT_MIN": _env_float("HEAT_GATE_9_COMMENT_MIN", 12000.0),
        "HEAT_GATE_10_POP_MIN": _env_float("HEAT_GATE_10_POP_MIN", 100.0),
        "HEAT_GATE_10_COMMENT_MIN": _env_float("HEAT_GATE_10_COMMENT_MIN", 30000.0),
        "COMMENT_REF": _env_float("COMMENT_REF", 50000.0),
        "COMMENT_GAMMA": _env_float("COMMENT_GAMMA", 1.15),
        "POP_WEIGHT": _env_float("POP_WEIGHT", 0.60),
        "CMT_WEIGHT": _env_float("CMT_WEIGHT", 0.40),
        "RAW_SCALE": _env_float("RAW_SCALE", 8.0),
        "HEAT_K": HEAT_K,
        "NEW_SONG_WINDOW_DAYS": _env_int("NEW_SONG_WINDOW_DAYS", 180),
        "HEAT_FRESH_HALFLIFE_DAYS": _env_float("HEAT_FRESH_HALFLIFE_DAYS", 180.0),
        "HEAT_NEW_SONG_FLOOR_RAW": _env_float("HEAT_NEW_SONG_FLOOR_RAW", 4.8),
        "HEAT_NEW_SONG_FLOOR_POP_MIN": _env_float("HEAT_NEW_SONG_FLOOR_POP_MIN", 35.0),
        "HEAT_NEW_SONG_FLOOR_COMMENT_MIN": _env_float("HEAT_NEW_SONG_FLOOR_COMMENT_MIN", 20.0),
        "HEAT_MOMENTUM_WEIGHT_MIN": _env_float("HEAT_MOMENTUM_WEIGHT_MIN", 0.25),
        "HEAT_MOMENTUM_WEIGHT_MAX": _env_float("HEAT_MOMENTUM_WEIGHT_MAX", 0.75),
    }


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def iter_audio_files(path: Path) -> Iterable[Path]:
    for dirpath, _, filenames in os.walk(path):
        for name in filenames:
            if Path(name).suffix.lower() in AUDIO_EXTS:
                yield Path(dirpath) / name


def load_json_samples(path: Path) -> List[Dict[str, object]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(data, dict) and "samples" in data:
        data = data["samples"]
    if not isinstance(data, list):
        raise ValueError("JSON samples must be a list or contain samples list")
    return data


def load_csv_samples(path: Path) -> List[Dict[str, object]]:
    rows: List[Dict[str, object]] = []
    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            rows.append(row)
    return rows


def normalize_sample(raw: Dict[str, object], now_ts: int) -> Dict[str, object]:
    metrics = dict(raw.get("metrics") or {})
    name = raw.get("name") or raw.get("title") or raw.get("track_name")
    track_id = raw.get("track_id") or raw.get("id") or name

    popularity = raw.get("popularity") or metrics.get("popularity") or metrics.get("_popularity")
    comment_count = raw.get("comment_count") or metrics.get("comment_count")
    publish_time = (
        raw.get("publish_time")
        or metrics.get("publish_time")
        or raw.get("publish_time_ms")
        or metrics.get("publish_time_ms")
    )
    days_since = raw.get("days_since") or metrics.get("days_since")

    if days_since is None and publish_time:
        days_since = (now_ts - int(publish_time)) / 86400000.0
    if days_since is not None and not publish_time:
        publish_time = int(now_ts - float(days_since) * 86400000.0)

    return {
        "track_id": track_id or "",
        "name": name or "",
        "popularity": float(popularity) if popularity is not None else None,
        "comment_count": int(comment_count) if comment_count is not None else None,
        "publish_time": int(publish_time) if publish_time is not None else None,
        "days_since": float(days_since) if days_since is not None else None,
    }


def fetch_metrics_from_identify(audio_path: Path, now_ts: int) -> Optional[Dict[str, object]]:
    try:
        out = os.popen(
            f'curl -s -X POST "http://127.0.0.1:8002/identify?debug=true" -F "file=@{audio_path}"'
        ).read()
    except Exception:
        return None
    try:
        data = json.loads(out)
    except Exception:
        return None
    if "detail" in data:
        return {"error": data.get("detail")}
    heat_debug = data.get("heat_debug") or {}
    normalized = heat_debug.get("normalized_metrics") or {}
    popularity = heat_debug.get("popularity")
    publish_time = normalized.get("publish_time")
    days_since = heat_debug.get("days_since_publish")

    name = data.get("match", {}).get("name") or audio_path.stem
    track_id = data.get("match", {}).get("track_id") or name

    if days_since is None and publish_time:
        days_since = (now_ts - int(publish_time)) / 86400000.0

    return {
        "track_id": track_id,
        "name": name,
        "popularity": popularity,
        "comment_count": normalized.get("comment_count"),
        "publish_time": publish_time,
        "days_since": days_since,
    }


def compute_v2_intermediates(
    sample: Dict[str, object], params: Dict[str, float | int], now_ts: int
) -> Dict[str, Optional[float]]:
    popularity = float(sample.get("popularity") or 0.0)
    comment_count = int(sample.get("comment_count") or 0)
    days_since = sample.get("days_since")
    publish_time = sample.get("publish_time")
    if days_since is None and publish_time:
        days_since = (now_ts - int(publish_time)) / 86400000.0

    pop_baseline = float(params["HEAT_POP_BASELINE"])
    p0 = float(params["P0"])
    pop_gamma = float(params["POP_GAMMA"])
    top_start = float(params["TOP_START"])
    top_boost = float(params["TOP_BOOST"])
    bonus_max = float(params["BONUS_MAX"])
    comment_shape = float(params["COMMENT_SHAPE"])
    x0 = float(params["X0"])
    x1 = float(params["X1"])
    gate9_pop_min = float(params["HEAT_GATE_9_POP_MIN"])
    gate9_comment_min = float(params["HEAT_GATE_9_COMMENT_MIN"])
    gate10_pop_min = float(params["HEAT_GATE_10_POP_MIN"])
    gate10_comment_min = float(params["HEAT_GATE_10_COMMENT_MIN"])
    comment_ref = float(params["COMMENT_REF"])
    comment_gamma = float(params["COMMENT_GAMMA"])
    pop_weight = float(params["POP_WEIGHT"])
    comment_weight = float(params["CMT_WEIGHT"])
    fresh_halflife = float(params["HEAT_FRESH_HALFLIFE_DAYS"])
    momentum_min = float(params["HEAT_MOMENTUM_WEIGHT_MIN"])
    momentum_max = float(params["HEAT_MOMENTUM_WEIGHT_MAX"])

    pop_denominator = max(100.0 - p0, 1.0)
    pop_norm = clamp((popularity - p0) / pop_denominator, 0.0, 1.0)
    pop_base = pop_norm**pop_gamma
    top_denominator = max(100.0 - top_start, 1.0)
    top_zone = clamp((popularity - top_start) / top_denominator, 0.0, 1.0)
    pop_top = top_boost * (top_zone**2)
    pop_term = clamp(pop_base + pop_top, 0.0, 1.0)
    base = 1.0 + 7.0 * pop_term

    comment_norm = 0.0
    if comment_ref > 0:
        comment_norm = math.log1p(comment_count) / math.log1p(comment_ref)
    comment_norm = clamp(comment_norm, 0.0, 1.2)
    cmt_term = comment_norm**comment_gamma
    lifetime_raw = pop_weight * pop_term + comment_weight * cmt_term
    x = math.log10(comment_count + 1)
    denom_x = max(x1 - x0, 1e-6)
    t = clamp((x - x0) / denom_x, 0.0, 1.0)
    t2 = t**comment_shape
    bonus = bonus_max * t2
    pop_gate = clamp((popularity - 95.0) / 5.0, 0.0, 1.0)
    bonus *= pop_gate
    heat10_base_bonus = clamp(base + bonus, 1.0, 10.0)
    ten_gate_pass = (popularity >= gate10_pop_min and comment_count >= gate10_comment_min)
    nine_gate_pass = (popularity >= gate9_pop_min and comment_count >= gate9_comment_min)
    if heat10_base_bonus >= 10.0 and not ten_gate_pass:
        heat10_base_bonus = 9.94
    if heat10_base_bonus >= 9.0 and not nine_gate_pass:
        heat10_base_bonus = 8.94

    days_for_rate = None
    plays_per_day = None
    comments_per_day = None
    pop_rate_term = None
    comment_rate_term_raw = None
    comment_rate_term = None
    momentum_raw = None
    fresh_factor = None
    w_momentum = None
    w_lifetime = None

    if days_since is not None:
        days_for_rate = max(float(days_since) + 3.0, 1.0)
        plays_per_day = popularity / days_for_rate
        comments_per_day = comment_count / days_for_rate
        pop_rate_term = math.log1p(plays_per_day) ** pop_gamma
        comment_rate_norm = 0.0
        if comment_ref > 0:
            comment_rate_norm = math.log1p(comments_per_day) / math.log1p(comment_ref)
        comment_rate_norm = clamp(comment_rate_norm, 0.0, 1.2)
        comment_rate_term_raw = comment_rate_norm
        comment_rate_term = comment_rate_norm**comment_gamma
        momentum_raw = pop_weight * pop_rate_term + comment_weight * comment_rate_term
        fresh_factor = math.exp(-float(days_since) / max(fresh_halflife, 1.0))
        w_momentum = clamp(
            momentum_min + (momentum_max - momentum_min) * fresh_factor,
            momentum_min,
            momentum_max,
        )
        w_lifetime = 1.0 - w_momentum

    return {
        "pop_norm": pop_norm,
        "pop_base": pop_base,
        "pop_top": pop_top,
        "pop_term": pop_term,
        "base": base,
        "bonus": bonus,
        "pop_gate": pop_gate,
        "t": t,
        "t2": t2,
        "x": x,
        "nine_gate_pass": nine_gate_pass,
        "ten_gate_pass": ten_gate_pass,
        "comment_norm": comment_norm,
        "comment_term_raw": comment_norm,
        "comment_conf": None,
        "comment_term": cmt_term,
        "cmt_term": cmt_term,
        "lifetime_raw": lifetime_raw,
        "days_for_rate": days_for_rate,
        "plays_per_day": plays_per_day,
        "comments_per_day": comments_per_day,
        "pop_rate_term": pop_rate_term,
        "comment_rate_term_raw": comment_rate_term_raw,
        "comment_rate_term": comment_rate_term,
        "momentum_raw": momentum_raw,
        "fresh_factor": fresh_factor,
        "w_momentum": w_momentum,
        "w_lifetime": w_lifetime,
        "heat10": heat10_base_bonus,
    }


def club_boost_for_title(name: str) -> Tuple[int, float]:
    tokens = ("remix", "edit", "bootleg", "vip", "flip", "mashup", "rework")
    lowered = name.lower()
    triggered = int(any(t in lowered for t in tokens))
    return triggered, 0.35 if triggered else 0.0


def compute_heat_10_raw(final_fused_raw: float) -> float:
    if final_fused_raw < 0:
        return 1.0
    return 1.0 + 9.0 * final_fused_raw / (final_fused_raw + HEAT_K)


def quantile(values: List[float], q: float) -> Optional[float]:
    if not values:
        return None
    sorted_vals = sorted(values)
    idx = int(math.ceil(q * len(sorted_vals))) - 1
    idx = clamp(idx, 0, len(sorted_vals) - 1)
    return sorted_vals[int(idx)]


def popularity_histogram(values: List[float]) -> Dict[str, int]:
    bins: List[Tuple[float, float]] = [(i, i + 10) for i in range(0, 100, 10)]
    counts = {f"{low}-{high}": 0 for low, high in bins}
    counts["100+"] = 0
    for v in values:
        placed = False
        for low, high in bins:
            if low <= v < high:
                counts[f"{low}-{high}"] += 1
                placed = True
                break
        if not placed:
            counts["100+"] += 1
    return counts


def build_top20_breakdown(rows: List[Dict[str, object]], limit: int = 20) -> List[Dict[str, object]]:
    sorted_rows = sorted(rows, key=lambda r: float(r.get("heat_score_raw") or 0.0), reverse=True)
    top = sorted_rows[:limit]
    out: List[Dict[str, object]] = []
    for row in top:
        out.append(
            {
                "track_id": row.get("track_id"),
                "name": row.get("name"),
                "popularity": row.get("popularity"),
                "comment_count": row.get("comment_count"),
                "pop_term": row.get("pop_term"),
                "cmt_term": row.get("cmt_term"),
                "pop_top": row.get("pop_top"),
                "base": row.get("base"),
                "bonus": row.get("bonus"),
                "pop_gate": row.get("pop_gate"),
                "t": row.get("t"),
                "t2": row.get("t2"),
                "x": row.get("x"),
                "nine_gate_pass": row.get("nine_gate_pass"),
                "ten_gate_pass": row.get("ten_gate_pass"),
                "raw": row.get("raw"),
                "R": row.get("R"),
                "heat_10": row.get("heat_10_raw"),
                "heat_score_raw": row.get("heat_score_raw"),
            }
        )
    return out


def ensure_outdir(outdir: Path) -> None:
    outdir.mkdir(parents=True, exist_ok=True)


def load_samples(args: argparse.Namespace, now_ts: int) -> Tuple[List[Dict[str, object]], str]:
    if args.input:
        path = Path(args.input)
        if path.suffix.lower() == ".json":
            raw_samples = load_json_samples(path)
        elif path.suffix.lower() == ".csv":
            raw_samples = load_csv_samples(path)
        else:
            raise ValueError("Unsupported input format")
        return [normalize_sample(sample, now_ts) for sample in raw_samples], "input_file"

    candidates = [
        ROOT / "data" / "heat_samples.json",
        ROOT / "data" / "heat_samples.csv",
        ROOT / "tests" / "fixtures" / "heat_samples.json",
    ]
    for candidate in candidates:
        if candidate.exists():
            if candidate.suffix.lower() == ".json":
                raw_samples = load_json_samples(candidate)
            else:
                raw_samples = load_csv_samples(candidate)
            return [normalize_sample(sample, now_ts) for sample in raw_samples], candidate.name

    audio_dirs = [
        Path.home() / "work" / "112teset",
        Path.home() / "Desktop" / "lab" / "112teset",
        Path.home() / "Desktop" / "112teset",
    ]
    for audio_dir in audio_dirs:
        if audio_dir.exists():
            audio_files = sorted(iter_audio_files(audio_dir))
            limit = args.limit or 124
            samples: List[Dict[str, object]] = []
            for audio_path in audio_files[:limit]:
                payload = fetch_metrics_from_identify(audio_path, now_ts)
                if payload is None or payload.get("error"):
                    samples.append(
                        {
                            "track_id": audio_path.stem,
                            "name": audio_path.stem,
                            "popularity": None,
                            "comment_count": None,
                            "publish_time": None,
                            "days_since": None,
                            "audio_path": str(audio_path),
                        }
                    )
                    continue
                payload["audio_path"] = str(audio_path)
                samples.append(payload)
            return samples, f"audio:{audio_dir}"

    raise FileNotFoundError("No sample sources found")


def build_metrics(sample: Dict[str, object]) -> Dict[str, object]:
    return {
        "play_count": 0,
        "comment_count": int(sample.get("comment_count") or 0),
        "liked_count": 0,
        "share_count": 0,
        "_popularity": float(sample.get("popularity") or 0.0),
        "_raw_title": sample.get("name") or "",
        "_cleaned_title": str(sample.get("name") or "").lower(),
        "publish_time": sample.get("publish_time"),
    }


def write_rows(
    out_path: Path,
    rows: List[Dict[str, object]],
    columns: List[str],
) -> None:
    with out_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def repeat_fetch_metrics(
    track_id: str,
    name: str,
    repeats: int,
    fetch_fn: Callable[[str], Dict[str, object]],
) -> Dict[str, object]:
    pops: List[Optional[float]] = []
    comments: List[Optional[float]] = []
    publish_times: List[Optional[float]] = []
    raw_sources: List[Optional[str]] = []
    popularity_sources: List[Optional[str]] = []
    comment_sources: List[Optional[str]] = []
    errors: List[str] = []
    failed = 0

    for _ in range(max(repeats, 0)):
        try:
            result = fetch_fn(track_id) or {}
        except Exception as exc:  # pragma: no cover - errors validated via tests
            errors.append(str(exc))
            result = {"ok": False, "error_reason": str(exc)}

        ok = bool(result.get("ok"))
        pop = result.get("popularity")
        comment = result.get("comment_count")
        publish_time = result.get("publish_time")
        raw_source = result.get("raw_source")
        popularity_source = result.get("popularity_source")
        comment_source = result.get("comment_source")

        pops.append(pop)
        comments.append(comment)
        publish_times.append(publish_time)
        raw_sources.append(raw_source)
        popularity_sources.append(popularity_source)
        comment_sources.append(comment_source)

        if not ok or pop is None or comment is None:
            failed = 1
            error_reason = result.get("error_reason")
            if error_reason:
                errors.append(str(error_reason))

    if failed or any(val is None for val in pops):
        same_popularity = 0
    else:
        same_popularity = 1 if len(set(pops)) <= 1 else 0

    if failed or any(val is None for val in comments):
        same_comment = 0
    else:
        same_comment = 1 if len(set(comments)) <= 1 else 0

    return {
        "track_id": track_id,
        "name": name,
        "failed": failed,
        "same_popularity": same_popularity,
        "same_comment": same_comment,
        "error_reason": "; ".join(errors) if errors else None,
        **{f"popularity_run{i+1}": v for i, v in enumerate(pops)},
        **{f"comment_run{i+1}": v for i, v in enumerate(comments)},
        **{f"publish_time_run{i+1}": v for i, v in enumerate(publish_times)},
        **{f"raw_source_run{i+1}": v for i, v in enumerate(raw_sources)},
        **{f"popularity_source_run{i+1}": v for i, v in enumerate(popularity_sources)},
        **{f"comment_source_run{i+1}": v for i, v in enumerate(comment_sources)},
    }


def fetch_netease_metrics(track_id: str) -> Dict[str, object]:
    from app.clients.netease_enhanced import NeteaseEnhancedClient

    client = NeteaseEnhancedClient()
    result = client.fetch_track_detail_with_meta(str(track_id))
    if not result.get("ok"):
        return {
            "ok": False,
            "error_reason": result.get("error_reason") or "netease_detail_empty",
            "raw_source": result.get("raw_source"),
            "popularity": None,
            "comment_count": None,
            "publish_time": None,
            "popularity_source": result.get("popularity_source"),
            "comment_source": result.get("comment_source"),
        }
    return {
        "ok": True,
        "error_reason": None,
        "raw_source": result.get("raw_source"),
        "popularity": result.get("popularity"),
        "comment_count": result.get("comment_count"),
        "publish_time": result.get("publish_time"),
        "popularity_source": result.get("popularity_source"),
        "comment_source": result.get("comment_source"),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Audit heat score v2 formula outputs")
    parser.add_argument("--input", type=str, help="input JSON/CSV samples")
    parser.add_argument("--outdir", type=str, default="out", help="output directory")
    parser.add_argument("--limit", type=int, help="limit samples")
    parser.add_argument("--repeat-fetch", type=int, default=0, help="repeat fetch count")
    args = parser.parse_args()

    now_ts = int(time.time() * 1000)
    params = get_env_params()

    samples, source_label = load_samples(args, now_ts)
    if args.limit:
        samples = samples[: args.limit]

    outdir = Path(args.outdir)
    ensure_outdir(outdir)

    rows: List[Dict[str, object]] = []
    final_fused_pre_vals: List[float] = []
    final_fused_post_vals: List[float] = []
    heat_10_vals: List[float] = []
    heat_score_vals: List[int] = []
    num_heat10_ge_9_before_gate = 0
    num_heat10_ge_9_after_gate = 0
    num_score_9_final = 0
    num_score_10_final = 0
    heat_score_raw_vals: List[float] = []
    lifetime_vals: List[float] = []
    momentum_vals: List[float] = []
    w_momentum_vals: List[float] = []
    fresh_vals: List[float] = []
    days_vals: List[float] = []
    popularity_vals: List[float] = []
    comment_vals: List[int] = []
    floor_triggers = 0
    club_triggers = 0

    for sample in samples:
        missing_days = 0
        days_since = sample.get("days_since")
        if days_since is None:
            missing_days = 1
        else:
            days_vals.append(float(days_since))

        popularity = sample.get("popularity")
        if popularity is not None:
            popularity_vals.append(float(popularity))
        comment_count = sample.get("comment_count")
        if comment_count is not None:
            comment_vals.append(int(comment_count))

        metrics = build_metrics(sample)
        if metrics.get("publish_time") and days_since is not None:
            now_ts = int(metrics["publish_time"] + float(days_since) * 86400 * 1000)
        _ = compute_heat_score(metrics, now_ts=now_ts, debug=True)

        intermediates = compute_v2_intermediates(sample, params, now_ts)
        club_trigger, club_amount = 0, 0.0
        club_triggers += club_trigger

        base_fused = intermediates["lifetime_raw"]
        final_fused_pre = base_fused
        final_fused_post = final_fused_pre * float(params["RAW_SCALE"])

        heat_10_raw = intermediates.get("heat10") or compute_heat_10_raw(final_fused_post)
        if intermediates.get("heat10") is not None and intermediates.get("heat10") >= 9.0:
            num_heat10_ge_9_before_gate += 1
        floor_trigger = 0
        if days_since is not None:
            if float(days_since) <= float(params["NEW_SONG_WINDOW_DAYS"]):
                if (
                    float(popularity or 0.0) >= float(params["HEAT_NEW_SONG_FLOOR_POP_MIN"])
                    or int(comment_count or 0) >= int(params["HEAT_NEW_SONG_FLOOR_COMMENT_MIN"])
                ):
                    floor_trigger = 1
                    heat_10_raw = max(heat_10_raw, float(params["HEAT_NEW_SONG_FLOOR_RAW"]))
        floor_triggers += floor_trigger

        if heat_10_raw >= 9.0:
            num_heat10_ge_9_after_gate += 1
        heat_score_raw = round(clamp(heat_10_raw, 1.0, 10.0), 2)
        heat_score = int(math.floor(clamp(heat_10_raw, 1.0, 10.0) + 1e-9))
        if heat_score == 9:
            num_score_9_final += 1
        if heat_score == 10:
            num_score_10_final += 1

        final_fused_pre_vals.append(final_fused_pre)
        final_fused_post_vals.append(final_fused_post)
        heat_10_vals.append(heat_10_raw)
        heat_score_vals.append(heat_score)
        heat_score_raw_vals.append(heat_score_raw)
        lifetime_vals.append(intermediates["lifetime_raw"])
        if intermediates["momentum_raw"] is not None:
            momentum_vals.append(intermediates["momentum_raw"])
        if intermediates["w_momentum"] is not None:
            w_momentum_vals.append(intermediates["w_momentum"])
        if intermediates["fresh_factor"] is not None:
            fresh_vals.append(intermediates["fresh_factor"])

        row = {
            "track_id": sample.get("track_id") or sample.get("name"),
            "name": sample.get("name"),
            "popularity": popularity,
            "comment_count": comment_count,
            "publish_time": sample.get("publish_time"),
            "days_since": days_since,
            "missing_days_since": missing_days,
            "HEAT_POP_BASELINE": params["HEAT_POP_BASELINE"],
            "HEAT_K": params["HEAT_K"],
            "NEW_SONG_WINDOW_DAYS": params["NEW_SONG_WINDOW_DAYS"],
            "HEAT_FRESH_HALFLIFE_DAYS": params["HEAT_FRESH_HALFLIFE_DAYS"],
            "HEAT_NEW_SONG_FLOOR_RAW": params["HEAT_NEW_SONG_FLOOR_RAW"],
            "HEAT_NEW_SONG_FLOOR_POP_MIN": params["HEAT_NEW_SONG_FLOOR_POP_MIN"],
            "HEAT_NEW_SONG_FLOOR_COMMENT_MIN": params["HEAT_NEW_SONG_FLOOR_COMMENT_MIN"],
            "pop_norm": intermediates["pop_norm"],
            "pop_term": intermediates["pop_term"],
            "pop_top": intermediates["pop_top"],
            "base": intermediates["base"],
            "bonus": intermediates["bonus"],
            "pop_gate": intermediates["pop_gate"],
            "t": intermediates["t"],
            "t2": intermediates["t2"],
            "x": intermediates["x"],
            "nine_gate_pass": intermediates.get("nine_gate_pass"),
            "ten_gate_pass": intermediates.get("ten_gate_pass"),
            "cmt_term": intermediates["cmt_term"],
            "comment_term_raw": intermediates["comment_term_raw"],
            "comment_conf": intermediates["comment_conf"],
            "comment_term": intermediates["comment_term"],
            "lifetime_raw": intermediates["lifetime_raw"],
            "days_for_rate": intermediates["days_for_rate"],
            "plays_per_day": intermediates["plays_per_day"],
            "comments_per_day": intermediates["comments_per_day"],
            "pop_rate_term": intermediates["pop_rate_term"],
            "comment_rate_term_raw": intermediates["comment_rate_term_raw"],
            "comment_rate_term": intermediates["comment_rate_term"],
            "momentum_raw": intermediates["momentum_raw"],
            "fresh_factor": intermediates["fresh_factor"],
            "w_momentum": intermediates["w_momentum"],
            "w_lifetime": intermediates["w_lifetime"],
            "final_fused_raw_pre_scale": final_fused_pre,
            "final_fused_raw_post_scale": final_fused_post,
            "raw": base_fused,
            "R": final_fused_post,
            "heat_10_raw": heat_10_raw,
            "heat_score_raw": heat_score_raw,
            "heat_score": heat_score,
            "club_boost_trigger": club_trigger,
            "club_boost_amount": club_amount,
            "new_song_floor_trigger": floor_trigger,
            "new_song_floor_value": float(params["HEAT_NEW_SONG_FLOOR_RAW"]) if floor_trigger else None,
        }
        rows.append(row)

    columns = list(rows[0].keys()) if rows else []
    write_rows(outdir / "heat_audit_rows.csv", rows, columns)

    top20_rows = build_top20_breakdown(rows, limit=20)
    write_rows(outdir / "top20_breakdown.csv", top20_rows, list(top20_rows[0].keys()) if top20_rows else [])

    heat_score_distribution = {str(k): 0 for k in range(1, 11)}
    for score in heat_score_vals:
        heat_score_distribution[str(score)] += 1

    summary = {
        "heat_score_distribution": heat_score_distribution,
        "heat_score_raw_stats": {
            "min": min(heat_score_raw_vals) if heat_score_raw_vals else None,
            "mean": round(mean(heat_score_raw_vals), 3) if heat_score_raw_vals else None,
            "median": quantile(heat_score_raw_vals, 0.5),
            "p90": quantile(heat_score_raw_vals, 0.9),
            "max": max(heat_score_raw_vals) if heat_score_raw_vals else None,
        },
        "final_fused_raw_pre_scale_stats": {
            "min": min(final_fused_pre_vals) if final_fused_pre_vals else None,
            "median": quantile(final_fused_pre_vals, 0.5),
            "p90": quantile(final_fused_pre_vals, 0.9),
            "max": max(final_fused_pre_vals) if final_fused_pre_vals else None,
        },
        "final_fused_raw_post_scale_stats": {
            "min": min(final_fused_post_vals) if final_fused_post_vals else None,
            "median": quantile(final_fused_post_vals, 0.5),
            "p90": quantile(final_fused_post_vals, 0.9),
            "max": max(final_fused_post_vals) if final_fused_post_vals else None,
        },
        "heat_10_raw_stats": {
            "min": min(heat_10_vals) if heat_10_vals else None,
            "median": quantile(heat_10_vals, 0.5),
            "p90": quantile(heat_10_vals, 0.9),
            "max": max(heat_10_vals) if heat_10_vals else None,
        },
        "lifetime_raw_stats": {
            "min": min(lifetime_vals) if lifetime_vals else None,
            "median": quantile(lifetime_vals, 0.5),
            "p90": quantile(lifetime_vals, 0.9),
            "max": max(lifetime_vals) if lifetime_vals else None,
        },
        "momentum_raw_stats": {
            "min": min(momentum_vals) if momentum_vals else None,
            "median": quantile(momentum_vals, 0.5),
            "p90": quantile(momentum_vals, 0.9),
            "max": max(momentum_vals) if momentum_vals else None,
        },
        "w_momentum_stats": {
            "min": min(w_momentum_vals) if w_momentum_vals else None,
            "median": quantile(w_momentum_vals, 0.5),
            "p90": quantile(w_momentum_vals, 0.9),
            "max": max(w_momentum_vals) if w_momentum_vals else None,
        },
        "fresh_factor_stats": {
            "min": min(fresh_vals) if fresh_vals else None,
            "median": quantile(fresh_vals, 0.5),
            "p90": quantile(fresh_vals, 0.9),
            "max": max(fresh_vals) if fresh_vals else None,
        },
        "days_since_stats": {
            "min": min(days_vals) if days_vals else None,
            "median": quantile(days_vals, 0.5),
            "p90": quantile(days_vals, 0.9),
            "max": max(days_vals) if days_vals else None,
            "ratio_le_180": sum(1 for v in days_vals if v <= 180) / len(days_vals) if days_vals else None,
            "ratio_le_30": sum(1 for v in days_vals if v <= 30) / len(days_vals) if days_vals else None,
        },
        "popularity_stats": {
            "min": min(popularity_vals) if popularity_vals else None,
            "median": quantile(popularity_vals, 0.5),
            "p90": quantile(popularity_vals, 0.9),
            "max": max(popularity_vals) if popularity_vals else None,
            "histogram": popularity_histogram(popularity_vals) if popularity_vals else None,
        },
        "comment_count_stats": {
            "min": min(comment_vals) if comment_vals else None,
            "median": quantile(comment_vals, 0.5),
            "p90": quantile(comment_vals, 0.9),
            "max": max(comment_vals) if comment_vals else None,
            "histogram": {
                "0": sum(1 for v in comment_vals if v == 0),
                "1-5": sum(1 for v in comment_vals if 1 <= v <= 5),
                "6-20": sum(1 for v in comment_vals if 6 <= v <= 20),
                "21-50": sum(1 for v in comment_vals if 21 <= v <= 50),
                "51-200": sum(1 for v in comment_vals if 51 <= v <= 200),
                "200+": sum(1 for v in comment_vals if v >= 201),
            }
            if comment_vals
            else None,
        },
        "trigger_rates": {
            "new_song_floor_trigger_rate": floor_triggers / len(samples) if samples else None,
            "club_boost_trigger_rate": club_triggers / len(samples) if samples else None,
        },
        "bucket_focus": {
            "heat_10_raw_6_5_7_49_ratio": sum(1 for v in heat_10_vals if 6.5 <= v <= 7.49)
            / len(heat_10_vals)
            if heat_10_vals
            else None,
            "final_fused_raw_post_scale_39_3_64_8_ratio": sum(
                1 for v in final_fused_post_vals if 39.3 <= v <= 64.8
            )
            / len(final_fused_post_vals)
            if final_fused_post_vals
            else None,
        },
        "notes": {
            "heat_k": HEAT_K,
            "raw_bucket_hint": "HEAT_K=25 时，7分对应 raw≈50，round 区间 raw≈39.3~64.8",
            "source_label": source_label,
        },
    }

    (outdir / "heat_audit_summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    if source_label.startswith("audio:"):
        field_source_note = [
            "字段语义来源:",
            "- popularity: 来自 identify?debug 的 heat_debug.popularity",
            "- comment_count: 来自 heat_debug.normalized_metrics.comment_count",
            "- publish_time/days_since: 来自 heat_debug.normalized_metrics.publish_time 与 days_since_publish",
        ]
    else:
        field_source_note = [
            "字段语义来源:",
            "- 无法追踪字段来源：请人工确认",
        ]

    summary_lines = [
        f"samples: {len(samples)}",
        f"heat_score_distribution: {summary['heat_score_distribution']}",
        f"heat_score_raw min/mean/median/p90/max: {summary['heat_score_raw_stats']}",
        f"7_bucket_ratio (heat_10_raw 6.50-7.49): {summary['bucket_focus']['heat_10_raw_6_5_7_49_ratio']}",
        f"raw_bucket_ratio (final_fused_raw_post_scale 39.3-64.8): {summary['bucket_focus']['final_fused_raw_post_scale_39_3_64_8_ratio']}",
        f"trigger_rates: {summary['trigger_rates']}",
        "HEAT_K=25 时，7分对应 raw≈50，round 区间 raw≈39.3~64.8",
        *field_source_note,
        "可选依赖提示: 若运行环境报缺依赖，可选安装: pip install mutagen",
    ]
    (outdir / "heat_audit_summary.txt").write_text("\n".join(summary_lines), encoding="utf-8")

    if args.repeat_fetch and args.repeat_fetch > 0:
        jitter_rows: List[Dict[str, object]] = []
        for sample in samples:
            track_id = str(sample.get("track_id") or "")
            name = str(sample.get("name") or "")
            if not track_id:
                jitter_rows.append(
                    {
                        "track_id": track_id,
                        "name": name,
                        "same_popularity": 0,
                        "same_comment": 0,
                        "error": "missing_track_id",
                    }
                )
                continue
            jitter_rows.append(
                repeat_fetch_metrics(track_id, name, args.repeat_fetch, fetch_netease_metrics)
            )
        jitter_cols: List[str] = []
        for row in jitter_rows:
            for key in row.keys():
                if key not in jitter_cols:
                    jitter_cols.append(key)
        write_rows(outdir / "heat_audit_fetch_jitter.csv", jitter_rows, jitter_cols)

    print(f"样本数量: {len(samples)}")
    print(f"heat_score 分布: {summary['heat_score_distribution']}")
    print("num_heat10_ge_9_before_gate:", num_heat10_ge_9_before_gate)
    print("num_heat10_ge_9_after_gate:", num_heat10_ge_9_after_gate)
    print("num_score_9_final:", num_score_9_final)
    print("num_score_10_final:", num_score_10_final)
    print(
        "heat_score_raw min/max/mean: ",
        summary["heat_score_raw_stats"]["min"],
        summary["heat_score_raw_stats"]["max"],
        summary["heat_score_raw_stats"]["mean"],
    )
    print(
        "7分桶占比:",
        summary["bucket_focus"]["heat_10_raw_6_5_7_49_ratio"],
    )
    print(
        "raw桶占比:",
        summary["bucket_focus"]["final_fused_raw_post_scale_39_3_64_8_ratio"],
    )
    raw_max = max(final_fused_post_vals) if final_fused_post_vals else None
    raw_p95 = quantile(final_fused_post_vals, 0.95)
    raw_median = quantile(final_fused_post_vals, 0.5)
    print("R max/p95/median:", raw_max, raw_p95, raw_median)
    if raw_max is not None:
        print("R<=60:", raw_max <= 60)
    raw_pre_p90 = quantile(lifetime_vals, 0.9)
    target_heat10 = 7.2
    target_R = HEAT_K * (target_heat10 - 1.0) / (10.0 - target_heat10)
    rec_scale = None
    if raw_pre_p90 and raw_pre_p90 > 0:
        rec_scale = target_R / raw_pre_p90
    print("v4 params:", {
        "P0": params["P0"],
        "TOP_START": params["TOP_START"],
        "TOP_BOOST": params["TOP_BOOST"],
        "BONUS_MAX": params["BONUS_MAX"],
        "COMMENT_SHAPE": params["COMMENT_SHAPE"],
        "X0": params["X0"],
        "X1": params["X1"],
    })

    print("recommended RAW_SCALE for heat10_p90=7.2:", rec_scale)


if __name__ == "__main__":
    main()
