from __future__ import annotations

import json
import logging
from pathlib import Path
from threading import Lock
from typing import Any, Dict, List

logger = logging.getLogger("setlists")

_LOCK = Lock()
_DATA_DIR = Path(__file__).resolve().parents[1] / "data"
_STORAGE_PATH = _DATA_DIR / "setlists.json"


def _read_setlists() -> List[Dict[str, Any]]:
    if not _STORAGE_PATH.exists():
        return []
    try:
        raw = _STORAGE_PATH.read_text(encoding="utf-8")
        data = json.loads(raw)
        if isinstance(data, list):
            return data
    except Exception as exc:
        logger.warning("failed to read setlists: %s", exc)
    return []


def _write_setlists(setlists: List[Dict[str, Any]]) -> None:
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    tmp_path = _STORAGE_PATH.with_suffix(".json.tmp")
    tmp_path.write_text(json.dumps(setlists, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp_path.replace(_STORAGE_PATH)


def list_setlists() -> List[Dict[str, Any]]:
    with _LOCK:
        return _read_setlists()


def upsert_setlist(setlist: Dict[str, Any]) -> Dict[str, Any]:
    with _LOCK:
        setlists = _read_setlists()
        filtered = [item for item in setlists if item.get("id") != setlist.get("id")]
        next_list = [setlist, *filtered]
        _write_setlists(next_list)
    return setlist


def delete_setlist(set_id: str) -> bool:
    with _LOCK:
        setlists = _read_setlists()
        filtered = [item for item in setlists if item.get("id") != set_id]
        if len(filtered) == len(setlists):
            return False
        _write_setlists(filtered)
        return True
