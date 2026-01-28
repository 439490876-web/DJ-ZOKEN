#!/usr/bin/env python3
"""Debug single NetEase track detail fetch."""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict

ROOT = Path(__file__).resolve().parents[1]
PYE_ROOT = ROOT / "apps" / "backend" / "PyLyrics-Extractor"
if not (PYE_ROOT / "app").exists():
    alt_root = ROOT.parent.parent
    alt_pye = alt_root / "apps" / "backend" / "PyLyrics-Extractor"
    if (alt_pye / "app").exists():
        PYE_ROOT = alt_pye
if str(PYE_ROOT) not in sys.path:
    sys.path.insert(0, str(PYE_ROOT))

from app.clients.netease_enhanced import NeteaseEnhancedClient


def main() -> None:
    parser = argparse.ArgumentParser(description="Debug netease track detail")
    parser.add_argument("--track-id", required=True, help="netease track id")
    parser.add_argument("--repeat", type=int, default=1, help="repeat times")
    args = parser.parse_args()

    client = NeteaseEnhancedClient()
    for idx in range(args.repeat):
        result: Dict[str, Any] = client.fetch_track_detail_with_meta(args.track_id)
        print(
            json.dumps(
                {
                    "run": idx + 1,
                    "ok": result.get("ok"),
                    "error_reason": result.get("error_reason"),
                    "raw_source": result.get("raw_source"),
                    "popularity": result.get("popularity"),
                    "comment_count": result.get("comment_count"),
                    "publish_time": result.get("publish_time"),
                    "popularity_source": result.get("popularity_source"),
                    "comment_source": result.get("comment_source"),
                },
                ensure_ascii=False,
            )
        )

    if os.getenv("NCM_DEBUG"):
        print("NCM_DEBUG enabled")


if __name__ == "__main__":
    main()
