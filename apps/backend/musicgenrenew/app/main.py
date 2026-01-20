from __future__ import annotations

import logging
import shutil
import sys
from typing import Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api import router
from .config import get_settings
from .logging import log_event, setup_logging
from .check_env import check_python_version
from .model.infer import ModelService, get_model_service


def create_app(
    model_service: Optional[ModelService] = None,
    load_model: Optional[bool] = None,
    enable_startup_checks: bool = True,
) -> FastAPI:
    settings = get_settings()
    setup_logging()
    app = FastAPI(title="Discogs EffNet Style Detection")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    service = model_service or get_model_service()
    app.state.model_service = service

    should_load = settings.preload_model if load_model is None else load_model

    @app.on_event("startup")
    def _startup() -> None:
        logger = logging.getLogger("musicgen")
        if enable_startup_checks:
            exit_code = check_python_version()
            if exit_code != 0:
                raise RuntimeError("unsupported Python version")

            ffmpeg_path = shutil.which(settings.ffmpeg_bin)
            if not ffmpeg_path:
                raise RuntimeError("ffmpeg not found in PATH; install via brew or set FFMPEG_BIN")

            try:
                import onnxruntime as ort
            except ImportError as exc:
                raise RuntimeError("onnxruntime is not installed") from exc

            log_event(
                logger,
                "startup_env",
                python=f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
                onnxruntime=ort.__version__,
                ffmpeg_path=ffmpeg_path,
            )

        if should_load:
            service.load(logger=logger)

    app.include_router(router)
    return app


app = create_app()
