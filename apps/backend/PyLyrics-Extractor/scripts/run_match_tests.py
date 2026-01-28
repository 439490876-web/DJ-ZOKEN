from __future__ import annotations

import argparse
import csv
import json
import statistics
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

import requests


AUDIO_EXTS = {".mp3", ".m4a", ".flac", ".wav"}


def iter_files(root: Path, recursive: bool) -> Iterable[Path]:
    iterator = root.rglob("*") if recursive else root.glob("*")
    for path in iterator:
        if path.is_file() and path.suffix.lower() in AUDIO_EXTS:
            yield path


def call_identify(api: str, file_path: Path) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    try:
        with file_path.open("rb") as handle:
            files = {"file": (file_path.name, handle, "application/octet-stream")}
            resp = requests.post(api, files=files, timeout=30)
        if resp.status_code != 200:
            return None, f"http_{resp.status_code}"
        try:
            payload = resp.json()
        except ValueError:
            return None, "invalid_json"
        return payload, None
    except requests.RequestException as exc:
        return None, f"request_error:{exc}"


def extract_row(file_path: Path, payload: Optional[Dict[str, Any]], error: Optional[str]) -> Dict[str, Any]:
    row = {
        "file_path": str(file_path),
        "decision": "",
        "confidence": "",
        "master_track_id": "",
        "clean_title": "",
        "clean_artist": "",
        "query_title": "",
        "query_artist": "",
        "netease_source": "",
        "netease_match_title": "",
        "netease_match_artist": "",
        "netease_match_score": "",
        "netease_match_track_id": "",
        "netease_candidate_count": "",
        "douyin_match_title": "",
        "cached": "",
        "duration_ms": "",
        "dj_edit_mode": "",
        "duration_mode": "",
        "base_text_score_best": "",
        "popularity_best": "",
        "popularity_bonus_value": "",
        "duration_override_applied": "",
        "decision_escalated_to_review": "",
        "decision_escalation_reason": "",
        "insufficient_title_metadata": "",
        "stripped_dj_tags": "",
        "decision_rule": "",
        "error": error or "",
    }
    if not payload:
        return row

    master = payload.get("master_track", {})
    evidence = payload.get("evidence", {})
    platform_matches = payload.get("platform_matches", {})

    row.update(
        {
            "decision": master.get("decision", ""),
            "confidence": master.get("confidence", ""),
            "master_track_id": master.get("master_track_id", ""),
            "clean_title": master.get("clean_title", ""),
            "clean_artist": master.get("clean_artist", ""),
            "query_title": master.get("query_title", ""),
            "query_artist": master.get("query_artist", ""),
            "netease_source": evidence.get("netease_source", ""),
            "cached": evidence.get("cached", ""),
            "duration_ms": master.get("duration_ms", ""),
            "dj_edit_mode": evidence.get("dj_edit_mode", False),
            "duration_mode": evidence.get("duration_mode", ""),
            "base_text_score_best": (evidence.get("base_text_score_best", {}) or {}).get(
                "netease", ""
            ),
            "popularity_best": (evidence.get("popularity_best", {}) or {}).get(
                "netease", ""
            ),
            "popularity_bonus_value": (
                evidence.get("popularity_bonus_value", {}) or {}
            ).get("netease", ""),
            "duration_override_applied": (
                evidence.get("duration_override_applied", {}) or {}
            ).get("netease", ""),
            "decision_escalated_to_review": evidence.get(
                "decision_escalated_to_review", False
            ),
            "decision_escalation_reason": evidence.get("decision_escalation_reason", ""),
            "insufficient_title_metadata": evidence.get(
                "insufficient_title_metadata", False
            ),
            "stripped_dj_tags": "|".join(evidence.get("stripped_dj_tags", []) or []),
            "decision_rule": (evidence.get("decision_rule", {}) or {}).get(
                "netease", ""
            ),
        }
    )

    netease = platform_matches.get("netease")
    if netease:
        row.update(
            {
                "netease_match_title": netease.get("title", ""),
                "netease_match_artist": netease.get("artist", ""),
                "netease_match_score": netease.get("score", ""),
                "netease_match_track_id": netease.get("track_id", ""),
            }
        )

    douyin = platform_matches.get("douyin")
    if douyin:
        row["douyin_match_title"] = douyin.get("title", "")

    netease_candidates = evidence.get("top_candidates", {}).get("netease", [])
    row["netease_candidate_count"] = len(netease_candidates)
    return row


def confidence_stats(values: List[float]) -> Tuple[float, float, float]:
    if not values:
        return 0.0, 0.0, 0.0
    avg = statistics.mean(values)
    med = statistics.median(values)
    sorted_vals = sorted(values)
    idx = int(round(0.9 * (len(sorted_vals) - 1)))
    p90 = sorted_vals[idx]
    return avg, med, p90


def infer_no_match_reason(payload: Dict[str, Any]) -> str:
    master = payload.get("master_track", {})
    evidence = payload.get("evidence", {})
    platform = payload.get("platform_matches", {})

    netease_candidates = evidence.get("top_candidates", {}).get("netease", [])
    if not netease_candidates:
        return "no_candidates_netease"

    netease_match = platform.get("netease")
    if netease_match and master.get("duration_ms") and netease_match.get("duration_ms"):
        delta = abs(master["duration_ms"] - netease_match["duration_ms"])
        duration_mode = evidence.get("duration_mode") or "strict"
        threshold = 15000 if duration_mode == "soft" else 5000
        override = (evidence.get("duration_override_applied", {}) or {}).get("netease")
        base_text_score = (evidence.get("base_text_score_best", {}) or {}).get("netease", 0)
        if not override and base_text_score >= 0.7 and delta > threshold:
            return "duration_mismatch"

    if evidence.get("version_tokens"):
        return "version_tokens_present"

    confidence = master.get("confidence") or 0.0
    if confidence < 0.5:
        return "low_confidence"

    return "title_artist_low"


def write_summary(
    out_dir: Path,
    rows: List[Dict[str, Any]],
    payloads: List[Dict[str, Any]],
    prev_metrics: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    total = len(rows)
    decisions = {"AUTO_MATCH": 0, "NEEDS_REVIEW": 0, "NO_MATCH": 0}
    confidences: List[float] = []
    netease_zero = 0
    netease_match = 0
    douyin_match = 0
    remix_swapped = 0
    dj_edit_count = 0
    dj_edit_decisions = {"AUTO_MATCH": 0, "NEEDS_REVIEW": 0, "NO_MATCH": 0}
    decision_rule_counts: Dict[str, int] = {}
    duration_override_count = 0
    duration_override_decisions = {"AUTO_MATCH": 0, "NEEDS_REVIEW": 0, "NO_MATCH": 0}
    decision_escalated_count = 0
    insufficient_title_count = 0
    stripped_dj_tag_counts: Dict[str, int] = {}

    no_match_reasons: Dict[str, int] = {}
    no_match_samples: Dict[str, List[str]] = {}

    for row, payload in zip(rows, payloads):
        decision = row.get("decision") or ""
        if decision in decisions:
            decisions[decision] += 1
        confidence = row.get("confidence")
        if isinstance(confidence, (int, float)):
            confidences.append(float(confidence))
        elif isinstance(confidence, str) and confidence:
            try:
                confidences.append(float(confidence))
            except ValueError:
                pass

        if row.get("netease_candidate_count") in (0, "0"):
            netease_zero += 1
        if row.get("netease_match_track_id"):
            netease_match += 1
        if row.get("douyin_match_title"):
            douyin_match += 1

        evidence = payload.get("evidence", {}) if payload else {}
        if evidence.get("remix_to_original_swapped") or evidence.get("remix_replaced"):
            remix_swapped += 1

        if evidence.get("dj_edit_mode"):
            dj_edit_count += 1
            if decision in dj_edit_decisions:
                dj_edit_decisions[decision] += 1

        if (evidence.get("duration_override_applied", {}) or {}).get("netease"):
            duration_override_count += 1
            if decision in duration_override_decisions:
                duration_override_decisions[decision] += 1

        if evidence.get("decision_escalated_to_review"):
            decision_escalated_count += 1

        if evidence.get("insufficient_title_metadata"):
            insufficient_title_count += 1

        for tag in evidence.get("stripped_dj_tags", []) or []:
            stripped_dj_tag_counts[tag] = stripped_dj_tag_counts.get(tag, 0) + 1

        rule = (evidence.get("decision_rule", {}) or {}).get("netease")
        if rule:
            decision_rule_counts[rule] = decision_rule_counts.get(rule, 0) + 1

        if decision == "NO_MATCH" and payload:
            reason = infer_no_match_reason(payload)
            no_match_reasons[reason] = no_match_reasons.get(reason, 0) + 1
            samples = no_match_samples.setdefault(reason, [])
            if len(samples) < 3:
                samples.append(row.get("file_path", ""))

    avg, med, p90 = confidence_stats(confidences)

    def ratio(count: int) -> str:
        return f"{(count / total * 100):.1f}%" if total else "0.0%"

    score_buckets = {
        "0.0-0.5": 0,
        "0.5-0.7": 0,
        "0.7-0.85": 0,
        "0.85-1.0": 0,
    }
    for value in confidences:
        if value < 0.5:
            score_buckets["0.0-0.5"] += 1
        elif value < 0.7:
            score_buckets["0.5-0.7"] += 1
        elif value < 0.85:
            score_buckets["0.7-0.85"] += 1
        else:
            score_buckets["0.85-1.0"] += 1

    metrics = {
        "total_files": total,
        "auto_match": decisions["AUTO_MATCH"],
        "needs_review": decisions["NEEDS_REVIEW"],
        "no_match": decisions["NO_MATCH"],
        "duration_mismatch": no_match_reasons.get("duration_mismatch", 0),
    }

    summary_path = out_dir / "summary.md"
    with summary_path.open("w", encoding="utf-8") as handle:
        handle.write("## Overview\n")
        handle.write(f"- total_files: {total}\n")
        for key in ("AUTO_MATCH", "NEEDS_REVIEW", "NO_MATCH"):
            handle.write(f"- {key}: {decisions[key]} ({ratio(decisions[key])})\n")
        handle.write(f"- confidence_avg: {avg:.3f}\n")
        handle.write(f"- confidence_median: {med:.3f}\n")
        handle.write(f"- confidence_p90: {p90:.3f}\n")
        handle.write(f"- netease_zero_candidates: {netease_zero} ({ratio(netease_zero)})\n")
        handle.write(f"- netease_match: {netease_match} ({ratio(netease_match)})\n")
        handle.write(f"- douyin_match: {douyin_match} ({ratio(douyin_match)})\n")
        handle.write(f"- remix_to_original_swapped: {remix_swapped} ({ratio(remix_swapped)})\n")
        handle.write(f"- dj_edit_mode: {dj_edit_count} ({ratio(dj_edit_count)})\n")
        handle.write(
            f"- dj_edit_mode_auto: {dj_edit_decisions['AUTO_MATCH']} ({ratio(dj_edit_decisions['AUTO_MATCH'])})\n"
        )
        handle.write(
            f"- dj_edit_mode_no_match: {dj_edit_decisions['NO_MATCH']} ({ratio(dj_edit_decisions['NO_MATCH'])})\n"
        )
        handle.write(
            f"- duration_override_applied: {duration_override_count} ({ratio(duration_override_count)})\n"
        )
        handle.write(
            f"- duration_override_auto: {duration_override_decisions['AUTO_MATCH']} ({ratio(duration_override_decisions['AUTO_MATCH'])})\n"
        )
        handle.write(
            f"- duration_override_no_match: {duration_override_decisions['NO_MATCH']} ({ratio(duration_override_decisions['NO_MATCH'])})\n\n"
        )
        handle.write(
            f"- decision_escalated_to_review: {decision_escalated_count} ({ratio(decision_escalated_count)})\n"
        )
        handle.write(
            f"- insufficient_title_metadata: {insufficient_title_count} ({ratio(insufficient_title_count)})\n\n"
        )

        handle.write("## Score Distribution\n")
        for label, count in score_buckets.items():
            handle.write(f"- {label}: {count}\n")
        handle.write("\n")

        handle.write("## NO_MATCH Reasons\n")
        if not no_match_reasons:
            handle.write("- none\n\n")
        else:
            for reason, count in sorted(
                no_match_reasons.items(), key=lambda item: item[1], reverse=True
            )[:3]:
                samples = ", ".join(no_match_samples.get(reason, []))
                handle.write(f"- {reason}: {count} ({ratio(count)}) | {samples}\n")
            handle.write("\n")

        handle.write("## Stripped DJ Tags\n")
        if not stripped_dj_tag_counts:
            handle.write("- none\n\n")
        else:
            for tag, count in sorted(
                stripped_dj_tag_counts.items(), key=lambda item: item[1], reverse=True
            )[:5]:
                handle.write(f"- {tag}: {count} ({ratio(count)})\n")
            handle.write("\n")

        handle.write("## Decision Rules\n")
        if not decision_rule_counts:
            handle.write("- none\n\n")
        else:
            for rule, count in sorted(
                decision_rule_counts.items(), key=lambda item: item[1], reverse=True
            ):
                handle.write(f"- {rule}: {count} ({ratio(count)})\n")
            handle.write("\n")

        handle.write("## Samples\n")
        auto_samples = [row for row in rows if row.get("decision") == "AUTO_MATCH"]
        auto_samples.sort(key=lambda r: float(r.get("confidence") or 0), reverse=True)
        handle.write("- top_auto_match\n")
        for row in auto_samples[:5]:
            handle.write(
                f"  {row.get('file_path')} | {row.get('confidence')} | {row.get('netease_match_title')}\n"
            )
        no_samples = [row for row in rows if row.get("decision") == "NO_MATCH"]
        no_samples.sort(key=lambda r: float(r.get("confidence") or 0))
        handle.write("- top_no_match\n")
        for row in no_samples[:5]:
            handle.write(
                f"  {row.get('file_path')} | {row.get('confidence')} | {row.get('netease_match_title')}\n"
            )

        handle.write("\n## Comparison\n")
        if prev_metrics:
            prev_no_match = prev_metrics.get("no_match", 0)
            prev_duration = prev_metrics.get("duration_mismatch", 0)
            handle.write(
                f"- NO_MATCH: {prev_no_match} -> {metrics['no_match']} (delta {metrics['no_match'] - prev_no_match})\n"
            )
            handle.write(
                f"- duration_mismatch: {prev_duration} -> {metrics['duration_mismatch']} (delta {metrics['duration_mismatch'] - prev_duration})\n"
            )
        else:
            handle.write("- previous_metrics: unavailable\n")

    histogram_path = out_dir / "score_histogram.txt"
    with histogram_path.open("w", encoding="utf-8") as handle:
        for label, count in score_buckets.items():
            bar = "#" * count
            handle.write(f"{label} | {bar}\n")

    metrics_path = out_dir / "summary_metrics.json"
    with metrics_path.open("w", encoding="utf-8") as handle:
        json.dump(metrics, handle, ensure_ascii=False, indent=2)

    return metrics


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dir", required=True, help="Directory with audio files")
    parser.add_argument(
        "--api",
        default="http://127.0.0.1:8002/identify",
        help="Identify endpoint URL",
    )
    parser.add_argument("--out", default="./out", help="Output directory")
    parser.add_argument("--max", type=int, default=0, help="Max files to test")
    parser.add_argument("--concurrency", type=int, default=2, help="Concurrent requests")
    parser.add_argument("--recursive", action="store_true", default=True)
    parser.add_argument("--no-recursive", dest="recursive", action="store_false")
    args = parser.parse_args()

    root = Path(args.dir)
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    summary_path = out_dir / "summary.md"
    prev_metrics = None
    metrics_path = out_dir / "summary_metrics.json"
    if summary_path.exists():
        summary_path.replace(out_dir / "prev_summary.md")
    if metrics_path.exists():
        try:
            prev_metrics = json.loads(metrics_path.read_text(encoding="utf-8"))
            metrics_path.replace(out_dir / "prev_summary_metrics.json")
        except json.JSONDecodeError:
            prev_metrics = None

    files = list(iter_files(root, args.recursive))
    if args.max:
        files = files[: args.max]

    rows: List[Dict[str, Any]] = []
    payloads: List[Dict[str, Any]] = []

    jsonl_path = out_dir / "results.jsonl"
    csv_path = out_dir / "results.csv"

    columns = [
        "file_path",
        "decision",
        "confidence",
        "master_track_id",
        "clean_title",
        "clean_artist",
        "query_title",
        "query_artist",
        "netease_source",
        "netease_match_title",
        "netease_match_artist",
        "netease_match_score",
        "netease_match_track_id",
        "netease_candidate_count",
        "douyin_match_title",
        "cached",
        "duration_ms",
        "dj_edit_mode",
        "duration_mode",
        "base_text_score_best",
        "popularity_best",
        "popularity_bonus_value",
        "duration_override_applied",
        "decision_escalated_to_review",
        "decision_escalation_reason",
        "insufficient_title_metadata",
        "stripped_dj_tags",
        "decision_rule",
        "error",
    ]

    def worker(path: Path) -> Tuple[Path, Optional[Dict[str, Any]], Optional[str]]:
        payload, error = call_identify(args.api, path)
        return path, payload, error

    with jsonl_path.open("w", encoding="utf-8") as jsonl_handle:
        with ThreadPoolExecutor(max_workers=max(1, args.concurrency)) as executor:
            futures = {executor.submit(worker, path): path for path in files}
            for future in as_completed(futures):
                path, payload, error = future.result()
                row = extract_row(path, payload, error)
                rows.append(row)
                payloads.append(payload or {})
                if payload:
                    jsonl_handle.write(
                        json.dumps({"file_path": str(path), "response": payload}, ensure_ascii=False)
                        + "\n"
                    )
                else:
                    jsonl_handle.write(
                        json.dumps({"file_path": str(path), "error": error}, ensure_ascii=False) + "\n"
                    )

    with csv_path.open("w", encoding="utf-8", newline="") as csv_handle:
        writer = csv.DictWriter(csv_handle, fieldnames=columns)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)

    write_summary(out_dir, rows, payloads, prev_metrics)


if __name__ == "__main__":
    main()
