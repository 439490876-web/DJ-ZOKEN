from __future__ import annotations

import logging
import os
import shutil

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from .db.sqlite import SQLiteStore
from .models import DBMasterBundle, HealthResponse, IdentifyResponse, MasterTrack, PlatformMatch
from .services.identify import OnlineHeatRequiredError, identify_file, save_upload_to_temp

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

app = FastAPI(title="Song Identify", version="0.1.0")
logger = logging.getLogger(__name__)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3004",
        "http://127.0.0.1:3004",
    ],
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
store = SQLiteStore()


@app.on_event("startup")
def log_startup_config() -> None:
    base_url = os.getenv("NETEASE_API_BASE_URL")
    client_label = "enhanced_api" if base_url else "mock"
    logging.info("NETEASE_API_BASE_URL=%s", base_url or "")
    logging.info("Using netease client: %s", client_label)


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse()


@app.post("/identify", response_model=IdentifyResponse)
async def identify(file: UploadFile = File(...), debug: bool = False) -> IdentifyResponse:
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="empty_file")

    logger.info("identify request: filename=%s size=%s debug=%s", file.filename, len(file_bytes), debug)
    temp_path = save_upload_to_temp(file_bytes, file.filename)
    try:
        response = identify_file(
            temp_path,
            file.filename,
            store,
            debug=debug,
            file_bytes=file_bytes,
        )
        return response
    except OnlineHeatRequiredError as exc:
        logger.warning(
            "identify online heat required: filename=%s reason=%s message=%s",
            file.filename,
            exc.reason,
            exc.message,
        )
        raise HTTPException(
            status_code=503,
            detail={
                "error": "online_heat_required",
                "reason": exc.reason,
                "message": exc.message,
                "ncm_status": exc.ncm_status,
                "http_error_code": exc.http_error_code,
                "error_message": exc.error_message,
                "netease_base_url": exc.base_url,
            },
        )
    finally:
        temp_dir = os.path.dirname(temp_path)
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)


@app.get("/master/{master_track_id}", response_model=DBMasterBundle)
def get_master(master_track_id: str) -> DBMasterBundle:
    bundle = store.get_master_bundle(master_track_id)
    if not bundle:
        raise HTTPException(status_code=404, detail="master_not_found")

    master = bundle["master_track"]
    master_track = MasterTrack(
        master_track_id=master["master_track_id"],
        clean_title=master["clean_title"],
        clean_artist=master["clean_artist"],
        query_title=master["query_title"],
        query_artist=master["query_artist"],
        duration_ms=master["duration_ms"],
        confidence=0.0,
        decision="",
    )

    platform_matches = {}
    for platform, data in bundle["platform_matches"].items():
        if not data:
            platform_matches[platform] = None
            continue
        platform_matches[platform] = PlatformMatch(
            track_id=data["platform_track_id"],
            title=data["title"],
            artist=data["artist"],
            duration_ms=data["duration_ms"],
            score=0.0,
        )

    return DBMasterBundle(
        master_track=master_track,
        platform_matches=platform_matches,
        mappings=bundle["mappings"],
    )
