from __future__ import annotations

import asyncio
import logging
import uuid
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse, StreamingResponse

from .models import AnalyzeResponse, BatchSubmitResponse
from .services.analyzer import analyze_bpm_key
from .services.jobs import job_manager
from .utils.audio_io import TempAudioFile, save_local_file, save_upload_file

logger = logging.getLogger("analyzer")

router = APIRouter(prefix="/api")

AUDIO_EXTENSIONS = {".mp3", ".wav", ".aiff", ".aif", ".flac"}


def _build_error_track(filename: str, error: str) -> dict:
    return {
        "id": str(uuid.uuid4()),
        "filename": filename,
        "duration_sec": 0.0,
        "bpm": None,
        "bpm_display": "0.0",
        "key_camelot": "8A",
        "key_text": "Unknown",
        "energy": None,
        "confidence": {"bpm": 0.0, "key": 0.0},
        "source": "hybrid",
        "details": {
            "bpm_source": "model_librosa",
            "key_source": "model_librosa",
            "raw_tags": {},
            "warnings": [error],
        },
    }


@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze(file: UploadFile = File(...)):
    temp_file: Optional[TempAudioFile] = None
    try:
        temp_file = save_upload_file(file)
        result = analyze_bpm_key(temp_file.path, temp_file.filename)
        return {
            "ok": True,
            "track": result.track,
            "errors": result.errors,
        }
    except Exception as exc:
        logger.exception("analysis failed: %s", exc)
        return JSONResponse(
            status_code=500,
            content={
                "ok": False,
                "track": None,
                "errors": ["analysis_failed"],
            },
        )
    finally:
        if temp_file:
            temp_file.cleanup()


@router.post("/analyze/batch", response_model=BatchSubmitResponse)
async def analyze_batch(
    files: Optional[List[UploadFile]] = File(default=None),
    files_alt: Optional[List[UploadFile]] = File(default=None, alias="files[]"),
    dir_path: Optional[str] = Form(default=None),
):
    temp_files: List[TempAudioFile] = []
    try:
        if dir_path:
            base = Path(dir_path).expanduser().resolve()
            if not base.exists() or not base.is_dir():
                raise HTTPException(status_code=400, detail="invalid dir_path")
            for entry in sorted(base.iterdir()):
                if entry.suffix.lower() in AUDIO_EXTENSIONS:
                    temp_files.append(save_local_file(entry))
        combined_files = []
        if files:
            combined_files.extend(files)
        if files_alt:
            combined_files.extend(files_alt)
        for upload in combined_files:
            temp_files.append(save_upload_file(upload))
    except Exception:
        for temp_file in temp_files:
            temp_file.cleanup()
        raise

    if not temp_files:
        raise HTTPException(status_code=400, detail="no files provided")

    job_state = job_manager.create_job(total=len(temp_files))

    async def process_job() -> None:
        success = 0
        failed = 0
        try:
            job_manager.publish_event(job_state.job_id, "job_started", {"job_id": job_state.job_id, "total": job_state.total})
            for index, temp_file in enumerate(temp_files, start=1):
                filename = temp_file.filename

                def progress(stage: str, percent: float) -> None:
                    job_manager.publish_event(
                        job_state.job_id,
                        "track_progress",
                        {
                            "job_id": job_state.job_id,
                            "index": index,
                            "filename": filename,
                            "stage": stage,
                            "percent": percent,
                        },
                    )

                try:
                    result = analyze_bpm_key(temp_file.path, filename, progress_cb=progress)
                    job_manager.publish_event(job_state.job_id, "track_done", result.track)
                    success += 1
                except Exception as exc:
                    logger.exception("track failed: %s", exc)
                    job_manager.publish_event(job_state.job_id, "track_done", _build_error_track(filename, "track_failed"))
                    failed += 1
                finally:
                    temp_file.cleanup()
            job_manager.publish_event(job_state.job_id, "job_done", {"job_id": job_state.job_id, "success": success, "failed": failed})
        except Exception as exc:
            logger.exception("job failed: %s", exc)
            job_manager.publish_event(job_state.job_id, "job_error", {"job_id": job_state.job_id, "error": "job_failed"})
        finally:
            job_manager.close_job(job_state.job_id)

    asyncio.create_task(process_job())

    return {"ok": True, "job_id": job_state.job_id, "total": job_state.total}


@router.get("/analyze/stream/{job_id}")
async def stream_job(job_id: str):
    job = job_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job not found")
    return StreamingResponse(job_manager.stream(job_id), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "Connection": "keep-alive"})
