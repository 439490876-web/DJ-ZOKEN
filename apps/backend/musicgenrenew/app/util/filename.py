from __future__ import annotations

from typing import Dict, Optional, Tuple


def resolve_display_filename(
    filename_raw: Optional[str],
    filename_original: Optional[str],
) -> Tuple[str, Dict[str, object]]:
    if filename_original:
        return filename_original, {
            "attempted": True,
            "method": "original_name",
            "success": True,
        }

    if not filename_raw:
        return "unknown", {"attempted": False, "method": "none", "success": False}

    try:
        raw_bytes = filename_raw.encode("latin-1", errors="strict")
        display = raw_bytes.decode("utf-8", errors="strict")
        return display, {"attempted": True, "method": "latin1_to_utf8", "success": True}
    except Exception:
        return filename_raw, {"attempted": True, "method": "utf8_from_raw", "success": True}
