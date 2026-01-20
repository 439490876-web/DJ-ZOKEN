import json
import logging
import sys
from typing import Any, Dict

from .config import get_settings


def setup_logging() -> None:
    settings = get_settings()
    logging.basicConfig(
        level=getattr(logging, settings.log_level.upper(), logging.INFO),
        format="%(message)s",
        stream=sys.stdout,
    )


def log_event(logger: logging.Logger, event: str, **fields: Any) -> None:
    payload: Dict[str, Any] = {"event": event, **fields}
    logger.info(json.dumps(payload, ensure_ascii=True, sort_keys=True))
