from __future__ import annotations

import shutil
import time
from pathlib import Path
from typing import Tuple
from urllib.request import urlopen

from ..config import Settings


class DownloadError(RuntimeError):
    pass


def _download_file(url: str, dest: Path, timeout: float) -> None:
    tmp_path = dest.with_suffix(dest.suffix + ".tmp")
    with urlopen(url, timeout=timeout) as resp, tmp_path.open("wb") as f:
        shutil.copyfileobj(resp, f)
    tmp_path.replace(dest)


def download_with_retries(
    url: str, dest: Path, timeout: float, retries: int
) -> None:
    last_error: Exception | None = None
    for attempt in range(1, retries + 1):
        try:
            _download_file(url, dest, timeout)
            if dest.stat().st_size <= 0:
                raise DownloadError("downloaded file is empty")
            return
        except Exception as exc:  # pragma: no cover - retry loop handles
            last_error = exc
            if attempt < retries:
                time.sleep(1.0 * attempt)
    raise DownloadError(f"failed to download {url}: {last_error}")


def _ensure_files(
    *,
    model_dir: Path,
    onnx_name: str,
    json_name: str,
    url_base: str,
    timeout: float,
    retries: int,
    error_hint: str,
) -> Tuple[Path, Path, str]:
    if not onnx_name or not json_name:
        raise DownloadError(f"{error_hint} files not configured.")

    model_dir.mkdir(parents=True, exist_ok=True)
    onnx_path = model_dir / onnx_name
    json_path = model_dir / json_name

    if onnx_path.exists() and json_path.exists():
        if onnx_path.stat().st_size > 0 and json_path.stat().st_size > 0:
            return onnx_path, json_path, "local"

    try:
        if not onnx_path.exists() or onnx_path.stat().st_size <= 0:
            download_with_retries(
                f"{url_base}/{onnx_name}",
                onnx_path,
                timeout,
                retries,
            )
        if not json_path.exists() or json_path.stat().st_size <= 0:
            download_with_retries(
                f"{url_base}/{json_name}",
                json_path,
                timeout,
                retries,
            )
    except Exception as exc:
        raise DownloadError(
            f"{error_hint} download failed.\n\n"
            "You can manually download the model files and place them in ./models/ :\n\n"
            f"- {onnx_name}\n"
            f"- {json_name}\n\n"
            "Then restart the service to skip downloading.\n\n"
            f"Reason: {exc}"
        ) from exc

    if onnx_path.stat().st_size <= 0:
        raise DownloadError(f"{error_hint} download failed: onnx file is empty.")
    if json_path.stat().st_size <= 0:
        raise DownloadError(f"{error_hint} download failed: json file is empty.")

    return onnx_path, json_path, "downloaded"


def ensure_model_files(settings: Settings) -> Tuple[Path, Path, str]:
    return _ensure_files(
        model_dir=Path(settings.model_dir),
        onnx_name=settings.model_onnx,
        json_name=settings.model_json,
        url_base=settings.model_url_base,
        timeout=settings.download_timeout,
        retries=settings.download_retries,
        error_hint="Model",
    )


def ensure_head_files(settings: Settings) -> Tuple[Path, Path, str]:
    return _ensure_files(
        model_dir=Path(settings.model_dir),
        onnx_name=settings.model_head_onnx,
        json_name=settings.model_head_json,
        url_base=settings.model_head_url_base,
        timeout=settings.download_timeout,
        retries=settings.download_retries,
        error_hint="Head model",
    )
