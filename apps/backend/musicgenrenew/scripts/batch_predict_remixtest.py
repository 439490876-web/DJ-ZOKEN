from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import re
import time
import uuid
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

import httpx

SUPPORTED_EXTS = {".mp3", ".wav", ".flac", ".m4a", ".aiff", ".aif"}


def _is_hidden(path: Path) -> bool:
    return any(part.startswith(".") for part in path.parts)


def scan_audio_files(input_dir: Path) -> List[Dict[str, Any]]:
    files = []
    for path in input_dir.rglob("*"):
        if not path.is_file():
            continue
        if _is_hidden(path):
            continue
        if path.suffix.lower() not in SUPPORTED_EXTS:
            continue
        size = path.stat().st_size
        if size <= 0:
            continue
        files.append(
            {
                "path": path,
                "relpath": str(path.relative_to(input_dir)),
                "abspath": str(path.resolve()),
                "size": size,
                "ext": path.suffix.lower(),
            }
        )
    return sorted(files, key=lambda item: item["relpath"])


def get_duration_ffprobe(path: Path, timeout: float = 5.0) -> Optional[float]:
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        str(path),
    ]
    try:
        import subprocess

        proc = subprocess.run(
            cmd,
            check=False,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=timeout,
        )
        if proc.returncode != 0:
            return None
        value = proc.stdout.decode("utf-8", errors="ignore").strip()
        return float(value) if value else None
    except Exception:
        return None


def _request_params(args: argparse.Namespace) -> Dict[str, Any]:
    return {
        "top_k": args.top_k,
        "threshold": args.threshold,
        "clip_seconds": args.clip_seconds,
        "segment_mode": args.segment_mode,
        "drop_strategy": args.drop_strategy,
        "drop_seconds": args.drop_seconds,
    }


def predict_via_api(
    path: Path,
    endpoint: str,
    params: Dict[str, Any],
    timeout: float,
    retries: int,
) -> Dict[str, Any]:
    last_error: Optional[Exception] = None
    for attempt in range(retries + 1):
        try:
            with httpx.Client(timeout=timeout) as client:
                with path.open("rb") as f:
                    resp = client.post(endpoint, params=params, files={"file": f})
            if resp.status_code >= 500:
                raise httpx.HTTPStatusError(
                    f"server error {resp.status_code}",
                    request=resp.request,
                    response=resp,
                )
            if resp.status_code != 200:
                raise RuntimeError(f"HTTP {resp.status_code}: {resp.text}")
            return resp.json()
        except (httpx.RequestError, httpx.TimeoutException, httpx.HTTPStatusError, RuntimeError) as exc:
            last_error = exc
            if attempt < retries:
                time.sleep(0.5 * (2**attempt))
                continue
            raise
    raise RuntimeError(f"API call failed: {last_error}")


def predict_direct(
    path: Path,
    params: Dict[str, Any],
) -> Dict[str, Any]:
    from app.model.infer import get_model_service

    service = get_model_service()
    if not service.is_loaded:
        service.load()
    top_styles, all_above, duration_sec, segment_info = service.predict_from_file(
        str(path),
        params["clip_seconds"],
        params["top_k"],
        params["threshold"],
        params["segment_mode"],
        params["drop_strategy"],
        params["drop_seconds"],
    )
    return {
        "request_id": str(uuid.uuid4()),
        "duration_sec": duration_sec,
        "segment": segment_info,
        "top_styles": [
            {"style": pred.style, "prob": pred.prob, "genre": pred.genre} for pred in top_styles
        ],
        "all_above_threshold": [
            {"style": pred.style, "prob": pred.prob, "genre": pred.genre} for pred in all_above
        ],
        "model_info": service.model_info(),
    }


def classify_error(message: str) -> str:
    text = message.lower()
    if "http" in text or "timeout" in text or "connect" in text or "server error" in text:
        return "upload/HTTP error"
    if "ffmpeg" in text or "decode" in text:
        return "ffmpeg decode error"
    if "model" in text or "onnxruntime" in text or "inference" in text:
        return "model inference error"
    if "unsupported" in text or "0 bytes" in text:
        return "unsupported file / 0 bytes"
    return "unknown error"


def sanitize_relpath(relpath: str) -> str:
    base = relpath.replace(os.sep, "__").replace(" ", "_")
    base = re.sub(r"[^A-Za-z0-9._-]", "_", base)
    stem = Path(base).stem
    digest = hashlib.sha1(relpath.encode("utf-8")).hexdigest()[:8]
    return f"{stem}_{digest}.wav"


def export_drop_wav(
    input_path: Path,
    output_path: Path,
    start_sec: float,
    end_sec: float,
    sr: int = 44100,
) -> None:
    import subprocess

    duration = max(0.0, end_sec - start_sec)
    if duration <= 0:
        raise RuntimeError("invalid drop segment duration")
    cmd = [
        "ffmpeg",
        "-nostdin",
        "-v",
        "error",
        "-y",
        "-i",
        str(input_path),
        "-ss",
        str(start_sec),
        "-t",
        str(duration),
        "-ac",
        "1",
        "-ar",
        str(sr),
        str(output_path),
    ]
    proc = subprocess.run(cmd, check=False, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.decode("utf-8", errors="ignore").strip())


def _top_n_styles(top_styles: List[Dict[str, Any]]) -> Tuple[str, str, str, float, float, float]:
    def _get(idx: int) -> Tuple[str, float]:
        if idx < len(top_styles):
            return top_styles[idx].get("style", ""), float(top_styles[idx].get("prob", 0.0))
        return "", 0.0

    s1, p1 = _get(0)
    s2, p2 = _get(1)
    s3, p3 = _get(2)
    return s1, s2, s3, p1, p2, p3


def _segment_fields(segment: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not segment:
        return {
            "segment_mode": "",
            "segment_start_sec": "",
            "segment_end_sec": "",
            "segment_strategy": "",
            "segment_drop_seconds": "",
        }
    return {
        "segment_mode": segment.get("mode", ""),
        "segment_start_sec": segment.get("start_sec", ""),
        "segment_end_sec": segment.get("end_sec", ""),
        "segment_strategy": segment.get("strategy", ""),
        "segment_drop_seconds": segment.get("drop_seconds", ""),
    }


def _process_one(
    file_info: Dict[str, Any],
    args: argparse.Namespace,
    params: Dict[str, Any],
) -> Dict[str, Any]:
    start_time = time.monotonic()
    duration_probe = get_duration_ffprobe(file_info["path"])
    response: Optional[Dict[str, Any]] = None
    status = "ok"
    error = ""
    drop_wav_path = ""
    try:
        if args.mode == "direct":
            response = predict_direct(file_info["path"], params)
        else:
            response = predict_via_api(
                file_info["path"],
                args.endpoint,
                params,
                args.timeout,
                args.retries,
            )
    except Exception as exc:
        status = "fail"
        category = classify_error(str(exc))
        error = f"{category}: {exc}"

    elapsed_ms = int((time.monotonic() - start_time) * 1000)
    duration_sec = None
    segment = None
    top_styles: List[Dict[str, Any]] = []
    if response:
        duration_sec = response.get("duration_sec")
        segment = response.get("segment")
        top_styles = response.get("top_styles", [])
    if duration_sec is None:
        duration_sec = duration_probe

    top1, top2, top3, p1, p2, p3 = _top_n_styles(top_styles)
    segment_fields = _segment_fields(segment)

    if (
        args.export_drops
        and status == "ok"
        and segment_fields["segment_mode"] == "drop"
        and segment_fields["segment_start_sec"] != ""
        and segment_fields["segment_end_sec"] != ""
    ):
        drop_dir = Path(args.out_dir) / "drops"
        drop_dir.mkdir(parents=True, exist_ok=True)
        filename = sanitize_relpath(file_info["relpath"])
        drop_path = drop_dir / filename
        try:
            export_drop_wav(
                file_info["path"],
                drop_path,
                float(segment_fields["segment_start_sec"]),
                float(segment_fields["segment_end_sec"]),
            )
            drop_wav_path = str(drop_path)
        except Exception as exc:
            print(f"Drop export failed for {file_info['relpath']}: {exc}")

    row = {
        "file_relpath": file_info["relpath"],
        "file_abspath": file_info["abspath"],
        "status": status,
        "error": error,
        "duration_sec": duration_sec if duration_sec is not None else "",
        "segment_mode": segment_fields["segment_mode"],
        "segment_start_sec": segment_fields["segment_start_sec"],
        "segment_end_sec": segment_fields["segment_end_sec"],
        "segment_strategy": segment_fields["segment_strategy"],
        "segment_drop_seconds": segment_fields["segment_drop_seconds"],
        "drop_wav_path": drop_wav_path,
        "top1_style": top1,
        "top1_prob": p1,
        "top2_style": top2,
        "top2_prob": p2,
        "top3_style": top3,
        "top3_prob": p3,
        "top_styles_json": json.dumps(top_styles, ensure_ascii=True),
    }

    jsonl = {
        "file_relpath": file_info["relpath"],
        "file_abspath": file_info["abspath"],
        "request_params": params,
        "response": response,
        "elapsed_ms": elapsed_ms,
        "status": status,
        "error": error,
        "drop_wav_path": drop_wav_path,
    }

    return {
        "row": row,
        "jsonl": jsonl,
        "elapsed_ms": elapsed_ms,
        "status": status,
        "error": error,
        "top1_style": top1,
        "top_styles": top_styles,
        "relpath": file_info["relpath"],
    }


def _write_csv(path: Path, rows: Iterable[Dict[str, Any]]) -> None:
    fieldnames = [
        "file_relpath",
        "file_abspath",
        "status",
        "error",
        "duration_sec",
        "segment_mode",
        "segment_start_sec",
        "segment_end_sec",
        "segment_strategy",
        "segment_drop_seconds",
        "drop_wav_path",
        "top1_style",
        "top1_prob",
        "top2_style",
        "top2_prob",
        "top3_style",
        "top3_prob",
        "top_styles_json",
    ]
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def _write_jsonl(path: Path, items: Iterable[Dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8") as f:
        for item in items:
            f.write(json.dumps(item, ensure_ascii=True))
            f.write("\n")


def _write_summary(
    path: Path,
    results: List[Dict[str, Any]],
    elapsed_ms: int,
    input_dir: Path,
) -> None:
    total = len(results)
    success = sum(1 for r in results if r["status"] == "ok")
    fail = total - success
    success_rate = (success / total * 100.0) if total else 0.0
    avg_ms = (elapsed_ms / total) if total else 0.0

    error_counts = Counter(r["error"] for r in results if r["status"] == "fail")
    top1_counts = Counter(r["top1_style"] for r in results if r["status"] == "ok" and r["top1_style"])
    top3_counts = Counter()
    for r in results:
        if r["status"] != "ok":
            continue
        for style in r["top_styles"][:3]:
            name = style.get("style")
            if name:
                top3_counts[name] += 1

    subdir_counts: Dict[str, List[int]] = defaultdict(lambda: [0, 0])
    for r in results:
        parts = Path(r["relpath"]).parts
        key = parts[0] if parts else "."
        subdir_counts[key][0] += 1
        if r["status"] == "ok":
            subdir_counts[key][1] += 1

    with path.open("w", encoding="utf-8") as f:
        f.write("# RemixTest Summary\n\n")
        f.write(f"- Input dir: `{input_dir}`\n")
        f.write(f"- Total files: {total}\n")
        f.write(f"- Success: {success}\n")
        f.write(f"- Fail: {fail}\n")
        f.write(f"- Success rate: {success_rate:.2f}%\n")
        f.write(f"- Total elapsed: {elapsed_ms/1000.0:.2f}s\n")
        f.write(f"- Avg per file: {avg_ms/1000.0:.2f}s\n\n")

        if total and (fail / total) > 0.2:
            f.write("## High Failure Rate (Top 5 Reasons)\n\n")
            for reason, count in error_counts.most_common(5):
                f.write(f"- {reason}: {count}\n")
            f.write("\n")

        f.write("## Failure Reasons\n\n")
        if error_counts:
            for reason, count in error_counts.most_common(10):
                f.write(f"- {reason}: {count}\n")
        else:
            f.write("- None\n")

        f.write("\n## Top Styles (top1)\n\n")
        for style, count in top1_counts.most_common(20):
            f.write(f"- {style}: {count}\n")
        if not top1_counts:
            f.write("- None\n")

        f.write("\n## Top Styles (top1-3 combined)\n\n")
        for style, count in top3_counts.most_common(20):
            f.write(f"- {style}: {count}\n")
        if not top3_counts:
            f.write("- None\n")

        f.write("\n## Success Rate by Subdir\n\n")
        for subdir, counts in sorted(subdir_counts.items()):
            total_sub, ok_sub = counts
            rate = (ok_sub / total_sub * 100.0) if total_sub else 0.0
            f.write(f"- {subdir}: {ok_sub}/{total_sub} ({rate:.2f}%)\n")


def run_batch(args: argparse.Namespace) -> int:
    input_dir = Path(os.path.expanduser(args.input_dir)).resolve()
    out_dir = Path(args.out_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    files = scan_audio_files(input_dir)
    if not files:
        print(f"No audio files found under {input_dir}")
        return 1

    params = _request_params(args)

    results = []
    rows = []
    jsonl = []

    start = time.monotonic()
    with ThreadPoolExecutor(max_workers=args.concurrency) as executor:
        futures = [
            executor.submit(_process_one, info, args, params)
            for info in files
        ]
        for future in as_completed(futures):
            try:
                result = future.result(timeout=args.timeout + 5)
            except Exception as exc:
                result = {
                    "row": {
                        "file_relpath": "",
                        "file_abspath": "",
                        "status": "fail",
                        "error": f"worker error: {exc}",
                        "duration_sec": "",
                        "segment_mode": "",
                        "segment_start_sec": "",
                        "segment_end_sec": "",
                        "segment_strategy": "",
                        "segment_drop_seconds": "",
                        "top1_style": "",
                        "top1_prob": 0.0,
                        "top2_style": "",
                        "top2_prob": 0.0,
                        "top3_style": "",
                        "top3_prob": 0.0,
                        "top_styles_json": "[]",
                    },
                    "jsonl": {
                        "file_relpath": "",
                        "file_abspath": "",
                        "request_params": params,
                        "response": None,
                        "elapsed_ms": 0,
                        "status": "fail",
                        "error": f"worker error: {exc}",
                    },
                    "elapsed_ms": 0,
                    "status": "fail",
                    "error": f"worker error: {exc}",
                    "top1_style": "",
                    "top_styles": [],
                    "relpath": "",
                }
            results.append(result)
            rows.append(result["row"])
            jsonl.append(result["jsonl"])

    elapsed_ms = int((time.monotonic() - start) * 1000)
    csv_path = out_dir / "remixtest_results.csv"
    jsonl_path = out_dir / "remixtest_results.jsonl"
    summary_path = out_dir / "remixtest_summary.md"

    _write_csv(csv_path, rows)
    _write_jsonl(jsonl_path, jsonl)
    _write_summary(summary_path, results, elapsed_ms, input_dir)

    for output in (csv_path, jsonl_path, summary_path):
        if not output.exists() or output.stat().st_size <= 0:
            print(f"Missing or empty output: {output}")
            return 1

    print(f"Wrote {csv_path}")
    print(f"Wrote {jsonl_path}")
    print(f"Wrote {summary_path}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Batch predict styles for ~/Desktop/remixtest")
    parser.add_argument("--input_dir", default="~/Desktop/remixtest")
    parser.add_argument("--endpoint", default="http://127.0.0.1:8000/predict")
    parser.add_argument("--top_k", type=int, default=10)
    parser.add_argument("--threshold", type=float, default=0.1)
    parser.add_argument("--clip_seconds", type=float, default=30.0)
    parser.add_argument("--drop_seconds", type=float, default=20.0)
    parser.add_argument("--drop_strategy", default="energy")
    parser.add_argument("--segment_mode", default="drop", choices=["drop", "full"])
    parser.add_argument("--concurrency", type=int, default=2)
    parser.add_argument("--timeout", type=float, default=60.0)
    parser.add_argument("--out_dir", default="reports")
    parser.add_argument("--mode", default="api", choices=["api", "direct"])
    parser.add_argument("--retries", type=int, default=2)
    parser.add_argument("--export_drops", type=int, default=0)
    return parser


def main(argv: Optional[List[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return run_batch(args)


if __name__ == "__main__":
    raise SystemExit(main())
