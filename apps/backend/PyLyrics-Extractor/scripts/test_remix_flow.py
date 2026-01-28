from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path
from typing import Any, Dict

import requests


def call_identify(api: str, file_path: Path) -> Dict[str, Any]:
    with file_path.open("rb") as handle:
        files = {"file": (file_path.name, handle, "application/octet-stream")}
        resp = requests.post(api, files=files, timeout=30)
    resp.raise_for_status()
    return resp.json()


def ensure_remix_copy(original: Path, suffix: str) -> Path:
    suffix = suffix.strip()
    spacer = " " if suffix and not suffix.startswith("(") else " "
    remix_name = f"{original.stem}{spacer}{suffix}{original.suffix}"
    remix_path = original.with_name(remix_name)
    if remix_path.exists():
        return remix_path
    shutil.copy2(original, remix_path)
    return remix_path


def summarize_match(payload: Dict[str, Any]) -> Dict[str, Any]:
    master = payload.get("master_track", {})
    platform = payload.get("platform_matches", {}).get("netease")
    evidence = payload.get("evidence", {})
    return {
        "query_title": master.get("query_title"),
        "query_artist": master.get("query_artist"),
        "master_track_id": master.get("master_track_id"),
        "confidence": master.get("confidence"),
        "decision": master.get("decision"),
        "netease_track_id": platform.get("track_id") if platform else None,
        "netease_title": platform.get("title") if platform else None,
        "netease_artist": platform.get("artist") if platform else None,
        "remix_to_original_swapped": evidence.get("remix_to_original_swapped")
        or evidence.get("remix_replaced"),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--api", default="http://127.0.0.1:8002/identify")
    parser.add_argument("--file", required=True)
    parser.add_argument("--suffix", default="(DJ Remix)")
    parser.add_argument("--keep-remix-file", action="store_true", default=True)
    parser.add_argument("--cleanup", dest="keep_remix_file", action="store_false")
    args = parser.parse_args()

    original_path = Path(args.file)
    if not original_path.exists():
        raise FileNotFoundError(original_path)

    remix_path = ensure_remix_copy(original_path, args.suffix)

    result_original = call_identify(args.api, original_path)
    result_remix = call_identify(args.api, remix_path)

    summary_original = summarize_match(result_original)
    summary_remix = summarize_match(result_remix)

    checks = []
    checks.append(
        (
            "query_title_match",
            summary_original["query_title"] == summary_remix["query_title"],
        )
    )
    checks.append(
        (
            "netease_track_match",
            summary_original["netease_track_id"]
            and summary_original["netease_track_id"] == summary_remix["netease_track_id"],
        )
    )
    checks.append(
        (
            "confidence_threshold",
            (summary_original["confidence"] or 0) >= 0.85
            and (summary_remix["confidence"] or 0) >= 0.85,
        )
    )
    checks.append(
        (
            "decision_ok",
            summary_original["decision"] in {"AUTO_MATCH", "NEEDS_REVIEW"}
            and summary_remix["decision"] in {"AUTO_MATCH", "NEEDS_REVIEW"},
        )
    )

    passed = all(flag for _, flag in checks)

    print("PASS" if passed else "FAIL")
    for name, ok in checks:
        print(f"- {name}: {ok}")
    print("- original:", summary_original)
    print("- remix:", summary_remix)

    out_dir = Path("out")
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "remix_test.json"
    with out_path.open("w", encoding="utf-8") as handle:
        json.dump(
            {
                "passed": passed,
                "original": result_original,
                "remix": result_remix,
                "comparison": {name: ok for name, ok in checks},
            },
            handle,
            ensure_ascii=False,
            indent=2,
        )

    if not args.keep_remix_file and remix_path.exists():
        remix_path.unlink()


if __name__ == "__main__":
    main()
