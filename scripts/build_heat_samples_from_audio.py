from __future__ import annotations

import argparse
import csv
import json
import os
import sys
from dataclasses import dataclass
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple


ROOT = Path(__file__).resolve().parents[1]
PYE_ROOT = ROOT / "apps" / "backend" / "PyLyrics-Extractor"
if str(PYE_ROOT) not in sys.path:
    sys.path.insert(0, str(PYE_ROOT))

try:
    from app.services import cleaning
except ImportError as exc:  # pragma: no cover - environment issue
    raise SystemExit(f"Unable to import cleaning strategy: {exc}")

from app.clients.netease_enhanced import NeteaseEnhancedClient

try:
    import mutagen  # type: ignore
except Exception:  # pragma: no cover - optional dependency
    mutagen = None  # type: ignore

try:
    import requests  # type: ignore
except Exception:  # pragma: no cover - optional dependency
    class _DummyRequests:
        class RequestException(Exception):
            pass

        def get(self, *args, **kwargs):
            raise self.RequestException("requests_missing")

    requests = _DummyRequests()

AUDIO_EXTS = {".mp3", ".m4a", ".flac", ".wav", ".aiff", ".aif"}


@dataclass
class Candidate:
    track_id: str
    name: str
    artist: str
    duration_ms: Optional[int]
    score: float


def _safe_str(value: Optional[str]) -> str:
    return value or ""


def _norm(text: str) -> str:
    return cleaning.normalize_similarity_text(text or "")


def _ratio(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    return SequenceMatcher(None, a, b).ratio()


def _normalize_publish_time(value: Optional[int], now_ts: int) -> Optional[int]:
    if value is None:
        return None
    try:
        ts = int(value)
    except (TypeError, ValueError):
        return None
    # 秒级 -> 毫秒
    if ts < 1_000_000_000_000:
        ts *= 1000
    # 微秒级 -> 毫秒
    if ts > 10 * now_ts:
        ts = ts // 1000
    return ts


def _first_tag(tags: Dict[str, Any], keys: Tuple[str, ...]) -> Optional[str]:
    for key in keys:
        if key in tags:
            value = tags.get(key)
            if isinstance(value, list) and value:
                return str(value[0])
            if isinstance(value, str):
                return value
    return None


def read_audio_tags(path: Path) -> Tuple[str, Optional[str], Optional[float], Optional[str]]:
    if mutagen is None:
        raise RuntimeError("mutagen_missing")

    raw_title = None
    raw_artist = None
    duration = None
    error_reason = None

    try:
        audio = mutagen.File(path, easy=True)
        if audio:
            tags = getattr(audio, "tags", {}) or {}
            raw_title = _first_tag(tags, ("title", "TIT2"))
            raw_artist = _first_tag(tags, ("artist", "TPE1"))
            info = getattr(audio, "info", None)
            duration = getattr(info, "length", None) if info else None
    except Exception as exc:  # pragma: no cover - runtime environment
        error_reason = f"mutagen_error:{exc}"

    if not raw_title:
        raw_title = path.stem
    return raw_title, raw_artist, duration, error_reason


def iter_audio_files(root: Path, limit: Optional[int] = None) -> List[Path]:
    files = [p for p in root.rglob("*") if p.suffix.lower() in AUDIO_EXTS and p.is_file()]
    files.sort()
    if limit is not None:
        return files[:limit]
    return files


def build_query(clean_result: cleaning.CleanResult) -> str:
    title = clean_result.query_title or clean_result.clean_title
    artist = clean_result.query_artist or clean_result.clean_artist
    if artist:
        return f"{artist} {title}".strip()
    return title.strip()


def score_candidate(sample: Dict[str, Any], candidate: Dict[str, Any]) -> float:
    title = _safe_str(sample.get("clean_title"))
    artist = _safe_str(sample.get("clean_artist"))
    cand_title = _safe_str(candidate.get("name"))
    cand_artist = " ".join(candidate.get("artists") or [])
    duration_s = sample.get("duration")
    cand_duration_ms = candidate.get("duration")

    title_sim = _ratio(_norm(title), _norm(cand_title))
    artist_sim = _ratio(_norm(artist), _norm(cand_artist))

    score = title_sim * 60.0 + artist_sim * 30.0

    if duration_s and cand_duration_ms:
        diff = abs(float(duration_s) - (float(cand_duration_ms) / 1000.0))
        if diff <= 3:
            score += 10.0
        elif diff <= 10:
            score += 4.0
        elif diff >= 30:
            score -= 5.0

    return max(0.0, min(100.0, round(score, 2)))


def flatten_candidates(candidates: List[Dict[str, Any]], max_candidates: int = 5) -> Dict[str, Any]:
    row: Dict[str, Any] = {}
    for idx in range(max_candidates):
        prefix = f"cand{idx + 1}_"
        if idx < len(candidates):
            cand = candidates[idx]
            row[prefix + "id"] = cand.get("id", "")
            row[prefix + "name"] = cand.get("name", "")
            row[prefix + "artist"] = ",".join(cand.get("artists") or [])
            row[prefix + "duration"] = cand.get("duration", "")
            row[prefix + "score"] = cand.get("score", "")
        else:
            row[prefix + "id"] = ""
            row[prefix + "name"] = ""
            row[prefix + "artist"] = ""
            row[prefix + "duration"] = ""
            row[prefix + "score"] = ""
    return row


def _normalize_candidates(payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    result = payload.get("result") or {}
    songs = result.get("songs") or []
    candidates: List[Dict[str, Any]] = []
    for song in songs:
        artists = song.get("artists") or song.get("ar") or []
        artist_names = [a.get("name", "") for a in artists if isinstance(a, dict)]
        duration = song.get("duration") or song.get("dt") or song.get("durationMs")
        candidates.append(
            {
                "id": str(song.get("id", "")),
                "name": song.get("name") or "",
                "artists": [a for a in artist_names if a],
                "duration": duration,
            }
        )
    return candidates


def search_ncm(query: str, limit: int = 5) -> Tuple[List[Dict[str, Any]], Optional[str]]:
    base_url = os.environ.get("NETEASE_API_BASE_URL", "http://127.0.0.1:3001")
    try:
        resp = requests.get(
            f"{base_url}/search",
            params={"keywords": query, "limit": limit, "type": 1},
            timeout=10,
        )
        if resp.status_code != 200:
            return [], f"http_{resp.status_code}"
        payload = resp.json()
        return _normalize_candidates(payload), None
    except requests.RequestException as exc:
        return [], f"request_error:{exc}"
    except ValueError:
        return [], "invalid_json"


def choose_best(sample: Dict[str, Any], candidates: List[Dict[str, Any]]) -> Tuple[Optional[Dict[str, Any]], List[Dict[str, Any]]]:
    scored: List[Dict[str, Any]] = []
    for cand in candidates:
        scored.append({**cand, "score": score_candidate(sample, cand)})
    scored.sort(key=lambda c: c.get("score", 0), reverse=True)
    best = scored[0] if scored else None
    return best, scored


def build_samples(
    audio_dir: Path,
    min_score: float = 70.0,
    limit: Optional[int] = None,
    enrich_detail: bool = False,
    detail_limit_rate: float = 5.0,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]]]:
    samples: List[Dict[str, Any]] = []
    review_rows: List[Dict[str, Any]] = []
    unmatched_rows: List[Dict[str, Any]] = []

    files = iter_audio_files(audio_dir, limit=limit)
    client = NeteaseEnhancedClient() if enrich_detail else None
    min_interval = 0.0
    last_detail_ts = None
    if enrich_detail and detail_limit_rate:
        min_interval = 1.0 / float(detail_limit_rate)
    for path in files:
        detail_payload = None
        detail_error = None
        if enrich_detail:
            detail_payload = {
                "detail_ok": 0,
                "detail_error_reason": "not_requested",
                "popularity": None,
                "comment_count": None,
                "publish_time": None,
                "popularity_source": None,
                "comment_source": None,
                "raw_source": None,
            }
        raw_title, raw_artist, duration, tag_error = read_audio_tags(path)
        clean_result = cleaning.clean_track(raw_title, raw_artist)
        query = build_query(clean_result)

        sample = {
            "clean_title": clean_result.clean_title,
            "clean_artist": clean_result.clean_artist,
            "duration": duration,
        }

        candidates, error_reason = search_ncm(query, limit=5)
        best, scored = choose_best(sample, candidates)

        base_row = {
            "audio_path": str(path),
            "raw_title": raw_title,
            "raw_artist": raw_artist or "",
            "cleaned_title": clean_result.clean_title,
            "cleaned_artist": clean_result.clean_artist,
            "query": query,
            "chosen_track_id": "",
            "match_score": "",
            "matched_name": "",
            "matched_artist": "",
            "matched_duration": "",
            "error_reason": error_reason or tag_error or "",
        }

        cand_row = flatten_candidates(scored, max_candidates=5)
        base_row.update(cand_row)

        if best and str(best.get("id", "")).isdigit():
            if enrich_detail and float(best.get("score", 0)) >= min_score and client:
                import time
                if min_interval and last_detail_ts is not None:
                    elapsed = time.monotonic() - last_detail_ts
                    if elapsed < min_interval:
                        time.sleep(min_interval - elapsed)
                detail = client.fetch_track_detail_with_meta(str(best.get("id")))
                last_detail_ts = time.monotonic()
                if detail.get("ok"):
                    detail_payload = {
                        "detail_ok": 1,
                        "detail_error_reason": "",
                        "popularity": detail.get("popularity"),
                        "comment_count": detail.get("comment_count"),
                        "publish_time": _normalize_publish_time(detail.get("publish_time"), int(time.time()*1000)),
                        "popularity_source": detail.get("popularity_source"),
                        "comment_source": detail.get("comment_source"),
                        "raw_source": detail.get("raw_source"),
                    }
                else:
                    detail_payload = {
                        "detail_ok": 0,
                        "detail_error_reason": detail.get("error_reason") or "detail_failed",
                        "popularity": None,
                        "comment_count": None,
                        "publish_time": None,
                        "popularity_source": detail.get("popularity_source"),
                        "comment_source": detail.get("comment_source"),
                        "raw_source": detail.get("raw_source"),
                    }
            best_score = float(best.get("score", 0))
            base_row["chosen_track_id"] = str(best.get("id"))
            base_row["match_score"] = best_score
            base_row["matched_name"] = best.get("name", "")
            base_row["matched_artist"] = ",".join(best.get("artists") or [])
            base_row["matched_duration"] = best.get("duration", "")

            if best_score >= min_score:
                sample_row = {
                    "track_id": str(best.get("id")),
                    "name": f"{raw_artist or ''} - {raw_title}".strip(" -"),
                    "query": query,
                    "match_score": best_score,
                    "matched_name": best.get("name", ""),
                    "matched_artist": ",".join(best.get("artists") or []),
                    "matched_duration": best.get("duration", ""),
                    "source": "ncm_search",
                    "audio_path": str(path),
                }
                if enrich_detail and detail_payload:
                    sample_row.update(detail_payload)
                samples.append(sample_row)
                if enrich_detail and detail_payload:
                    base_row.update(detail_payload)
                review_rows.append(base_row)
            else:
                unmatched_rows.append(base_row)
        else:
            unmatched_rows.append(base_row)

    return samples, review_rows, unmatched_rows


def write_json(path: Path, data: List[Dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(data, handle, ensure_ascii=False, indent=2)


def write_csv(path: Path, rows: List[Dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not rows:
        with path.open("w", newline="", encoding="utf-8") as handle:
            handle.write("")
        return
    fieldnames = list(rows[0].keys())
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--audio-dir", required=True)
    parser.add_argument("--out-json", default="data/heat_samples.json")
    parser.add_argument("--min-score", type=float, default=70.0)
    parser.add_argument("--limit", type=int)
    parser.add_argument("--enrich-detail", action="store_true")
    parser.add_argument("--detail-limit-rate", type=float, default=5.0)
    args = parser.parse_args()

    if mutagen is None:
        raise SystemExit("mutagen not installed. Run: pip install mutagen")

    audio_dir = Path(args.audio_dir)
    out_json = Path(args.out_json)
    out_dir = ROOT / "out"

    samples, review_rows, unmatched_rows = build_samples(
        audio_dir=audio_dir,
        min_score=args.min_score,
        limit=args.limit,
        enrich_detail=args.enrich_detail,
        detail_limit_rate=args.detail_limit_rate,
    )

    write_json(out_json, samples)
    write_csv(out_dir / "heat_samples_review.csv", review_rows)
    write_csv(out_dir / "heat_samples_unmatched.csv", unmatched_rows)

    print(f"samples: {len(samples)}")
    print(f"review_rows: {len(review_rows)}")
    print(f"unmatched_rows: {len(unmatched_rows)}")


if __name__ == "__main__":
    main()
