from __future__ import annotations

import argparse
import csv
import json
import random
import sys
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

ROOT = Path(__file__).resolve().parents[1]
PYE_ROOT = ROOT / "apps" / "backend" / "PyLyrics-Extractor"
if str(PYE_ROOT) not in sys.path:
    sys.path.insert(0, str(PYE_ROOT))

from app.clients.netease_enhanced import NeteaseEnhancedClient


def load_samples(path: Path) -> List[Dict[str, Any]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(data, dict) and "samples" in data:
        data = data["samples"]
    if not isinstance(data, list):
        raise ValueError("samples file must be a list")
    return data


def select_samples(samples: List[Dict[str, Any]], limit: int, mode: str, seed: int) -> List[Dict[str, Any]]:
    filtered = [s for s in samples if int(s.get("detail_ok") or 0) == 1]
    if not filtered:
        return []
    if mode == "top-score":
        filtered.sort(key=lambda s: float(s.get("match_score") or 0), reverse=True)
        return filtered[:limit]
    rng = random.Random(seed)
    if len(filtered) <= limit:
        return filtered
    return rng.sample(filtered, limit)


def popularity_100_ratio(values: List[Optional[float]]) -> Optional[float]:
    nums = [v for v in values if v is not None]
    if not nums:
        return None
    return sum(1 for v in nums if float(v) == 100.0) / len(nums)


def extract_raw_field(detail: Optional[Dict[str, Any]], key: str) -> Optional[float]:
    if not detail:
        return None
    value = detail.get(key)
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def inspect_details(samples: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    client = NeteaseEnhancedClient()
    rows: List[Dict[str, Any]] = []
    for sample in samples:
        track_id = str(sample.get("track_id", ""))
        name = sample.get("name", "")
        result = client.fetch_track_detail_with_meta(track_id)
        detail = result.get("detail") if isinstance(result, dict) else None
        row = {
            "track_id": track_id,
            "name": name,
            "popularity": result.get("popularity") if isinstance(result, dict) else None,
            "popularity_source": result.get("popularity_source") if isinstance(result, dict) else None,
            "comment_count": result.get("comment_count") if isinstance(result, dict) else None,
            "comment_source": result.get("comment_source") if isinstance(result, dict) else None,
            "publish_time": result.get("publish_time") if isinstance(result, dict) else None,
            "raw_source": result.get("raw_source") if isinstance(result, dict) else None,
            "playCount": extract_raw_field(detail, "playCount"),
            "score": extract_raw_field(detail, "score"),
            "likedCount": extract_raw_field(detail, "likedCount"),
            "shareCount": extract_raw_field(detail, "shareCount"),
            "detail_ok": 1 if result.get("ok") else 0,
            "detail_error_reason": result.get("error_reason") if isinstance(result, dict) else None,
        }
        rows.append(row)
    return rows


def write_csv(path: Path, rows: List[Dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not rows:
        path.write_text("", encoding="utf-8")
        return
    fieldnames = list(rows[0].keys())
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default="data/heat_samples.json")
    parser.add_argument("--limit", type=int, default=20)
    parser.add_argument("--mode", choices=["random", "top-score"], default="random")
    parser.add_argument("--seed", type=int, default=7)
    args = parser.parse_args()

    samples = load_samples(Path(args.input))
    selected = select_samples(samples, limit=args.limit, mode=args.mode, seed=args.seed)
    rows = inspect_details(selected)
    write_csv(ROOT / "out" / "ncm_detail_field_snapshot.csv", rows)

    sample_ratio = popularity_100_ratio([row.get("popularity") for row in rows])
    full_ratio = popularity_100_ratio([s.get("popularity") for s in samples])

    print(f"sample_popularity_100_ratio: {sample_ratio}")
    print(f"full_popularity_100_ratio: {full_ratio}")


if __name__ == "__main__":
    main()
