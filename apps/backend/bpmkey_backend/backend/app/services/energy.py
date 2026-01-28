from __future__ import annotations

import logging
import sys
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Optional

logger = logging.getLogger("analyzer")


@dataclass
class EnergyResult:
    value: Optional[float]
    source: str
    warning: Optional[str]


def _find_vibenet_root() -> Optional[Path]:
    current = Path(__file__).resolve()
    for parent in current.parents:
        candidate = parent / "apps" / "backend" / "newenergy" / "vibenet"
        if candidate.exists():
            return candidate
    return None


def _ensure_vibenet_path() -> bool:
    try:
        import vibenet  # noqa: F401
        return True
    except Exception:
        vibenet_root = _find_vibenet_root()
        if not vibenet_root:
            return False
        root_str = str(vibenet_root)
        if root_str not in sys.path:
            sys.path.insert(0, root_str)
        try:
            import vibenet  # noqa: F401
            return True
        except Exception:
            return False


@lru_cache(maxsize=1)
def _load_model():
    if not _ensure_vibenet_path():
        logger.warning("vibenet package not available; energy disabled")
        return None
    try:
        from vibenet import load_model
        return load_model()
    except Exception as exc:
        logger.warning("vibenet load_model failed: %s", exc)
        return None


def predict_energy(path: Path) -> EnergyResult:
    model = _load_model()
    if model is None:
        return EnergyResult(value=None, source="unavailable", warning="energy_unavailable")
    try:
        results = model.predict(str(path))
        if not results:
            return EnergyResult(value=None, source="vibenet", warning="energy_empty")
        energy = float(results[0].energy)
        energy = max(0.0, min(1.0, energy))
        return EnergyResult(value=energy, source="vibenet", warning=None)
    except Exception as exc:
        logger.warning("energy prediction failed: %s", exc)
        return EnergyResult(value=None, source="vibenet", warning="energy_failed")
