#!/usr/bin/env python
from __future__ import annotations

import argparse
import os
import socket
import sqlite3
import subprocess
import time
from pathlib import Path
from typing import Tuple

import requests


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Verify heat backend is using v4-popcomment")
    parser.add_argument(
        "--base-url",
        default="http://127.0.0.1:8002",
        help="PyLyrics-Extractor base URL",
    )
    parser.add_argument(
        "--db-path",
        default=os.path.join(
            os.path.dirname(__file__),
            "..",
            "apps",
            "backend",
            "PyLyrics-Extractor",
            "app",
            "data.db",
        ),
        help="SQLite cache path",
    )
    parser.add_argument("--timeout", type=float, default=120.0, help="HTTP timeout seconds")
    parser.add_argument(
        "--audio-file",
        default=None,
        help="Optional audio file for identify validation",
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Exit non-zero on verify failure",
    )
    return parser.parse_args(argv)


def clear_cache(db_path: str) -> Tuple[bool, str]:
    if not os.path.exists(db_path):
        return False, "db_not_found"
    conn = sqlite3.connect(db_path)
    try:
        conn.execute("DELETE FROM cache")
        conn.commit()
    finally:
        conn.close()
    return True, "cleared"


def _get_listen_pid(port: int) -> str | None:
    try:
        output = subprocess.check_output(
            ["/usr/sbin/lsof", "-nP", f"-iTCP:{port}", "-sTCP:LISTEN", "-t"],
            text=True,
        ).strip()
    except Exception:
        return None
    return output.splitlines()[0] if output else None


def restart_backend(port: int = 8002) -> bool:
    backend_dir = Path(__file__).resolve().parents[1] / "apps" / "backend" / "PyLyrics-Extractor"
    if not backend_dir.exists():
        return False
    pid = _get_listen_pid(port)
    if pid:
        try:
            subprocess.check_call(["/bin/kill", pid])
            time.sleep(0.5)
        except Exception:
            pass
    cmd = (
        f"cd {backend_dir} && set -a && [ -f .env ] && source .env && set +a && "
        f"./.venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port {port}"
    )
    subprocess.Popen(["/bin/bash", "-lc", cmd], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return True


def wait_for_port(host: str, port: int, timeout_s: float = 10.0, interval: float = 0.3) -> bool:
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        try:
            with socket.create_connection((host, port), timeout=interval):
                return True
        except OSError:
            time.sleep(interval)
    return False


def _default_audio_file() -> str | None:
    sample = Path(__file__).resolve().parents[1] / "apps" / "backend" / "newenergy" / "vibenet" / "sample.wav"
    if sample.exists():
        return str(sample)
    return None


def check_heat_source(base_url: str, audio_file: str | None, timeout: float) -> Tuple[bool, str]:
    path = audio_file or _default_audio_file()
    if not path or not os.path.exists(path):
        return False, "sample_missing"
    url = f"{base_url.rstrip('/')}/identify?debug=true"
    try:
        with open(path, "rb") as f:
            resp = requests.post(url, files={"file": f}, timeout=timeout)
    except requests.RequestException as exc:
        return False, f"connection_failed:{exc.__class__.__name__}"
    if resp.status_code != 200:
        try:
            data = resp.json()
            detail = data.get("detail") if isinstance(data, dict) else None
            message = None
            if isinstance(detail, dict):
                message = detail.get("message")
            elif detail:
                message = str(detail)
            if message:
                return False, message
        except Exception:
            pass
        return False, f"http_{resp.status_code}"
    data = resp.json()
    heat_source = (data.get("evidence") or {}).get("heat_source")
    if heat_source != "v4-popcomment":
        return False, f"heat_source={heat_source}"
    return True, "ok"


def run_verify(
    *,
    base_url: str,
    db_path: str,
    audio_file: str | None,
    timeout: float,
    strict: bool,
) -> int:
    cache_ok, cache_msg = clear_cache(db_path)
    print(f"cache_clear={cache_ok} ({cache_msg})")

    restarted = restart_backend()
    print(f"backend_restart={restarted}")

    host = "127.0.0.1"
    port = 8002
    ready = wait_for_port(host, port, timeout_s=10.0, interval=0.3)
    print(f"backend_ready={ready}")

    ok, reason = check_heat_source(base_url, audio_file, timeout)
    print(f"heat_verify={ok} ({reason})")
    if not ok and strict:
        return 2
    return 0


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    audio_file = args.audio_file or os.getenv("HEAT_VERIFY_AUDIO")
    return run_verify(
        base_url=args.base_url,
        db_path=args.db_path,
        audio_file=audio_file,
        timeout=args.timeout,
        strict=args.strict,
    )


if __name__ == "__main__":
    raise SystemExit(main())
