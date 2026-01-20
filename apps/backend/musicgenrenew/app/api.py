from __future__ import annotations

import logging
import os
import re
import tempfile
import time
import uuid
from typing import List, Optional

import anyio
from fastapi import APIRouter, File, Form, HTTPException, Query, Request, UploadFile

from .config import get_settings
from .dj_rules.resolve import resolve_dj_style
from .logging import log_event
from .model.infer import Prediction
from .schemas.responses import HealthResponse, PredictResponse
from .util.filename import resolve_display_filename

router = APIRouter()
logger = logging.getLogger("musicgen")


def _save_upload_to_temp(upload: UploadFile, max_bytes: int) -> str:
    suffix = os.path.splitext(upload.filename or "upload")[1]
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        size = 0
        while True:
            chunk = upload.file.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            if size > max_bytes:
                tmp.close()
                os.unlink(tmp.name)
                raise HTTPException(status_code=413, detail="file too large")
            tmp.write(chunk)
        return tmp.name


def _serialize_predictions(preds: List[Prediction]) -> List[dict]:
    return [
        {"style": pred.style, "prob": pred.prob, "genre": pred.genre}
        for pred in preds
    ]


def _summarize_styles(preds: List[Prediction], limit: int = 3) -> List[dict]:
    summary = []
    for pred in preds[:limit]:
        summary.append(
            {
                "style": pred.style,
                "prob": pred.prob,
                "genre": pred.genre,
            }
        )
    return summary


def _extract_bpm_from_filename(name: Optional[str]) -> Optional[float]:
    if not name:
        return None
    matches = re.findall(r"(\\d{2,3})(?:\\s?bpm)?", name.lower())
    candidates = []
    for match in matches:
        try:
            value = float(match)
        except ValueError:
            continue
        if 60.0 <= value <= 220.0:
            candidates.append(value)
    if not candidates:
        return None
    return candidates[-1]


def _build_empty_segment(
    segment_mode: str,
    drop_strategy: str,
    drop_seconds: Optional[float],
    candidate_top_n: Optional[int],
) -> dict:
    return {
        "mode": segment_mode,
        "start_sec": 0.0,
        "end_sec": 0.0,
        "strategy": drop_strategy,
        "drop_seconds": drop_seconds,
        "candidate_top_n": candidate_top_n,
        "candidate_segments": None,
    }


def _error_response(
    request_id: str,
    filename_raw: Optional[str],
    filename_original: Optional[str],
    filename_display: str,
    filename_decode: dict,
    segment_mode: str,
    drop_strategy: str,
    drop_seconds: Optional[float],
    candidate_top_n: Optional[int],
    model_info: dict,
    error_code: str,
    error_message: str,
    error_detail: Optional[str] = None,
) -> dict:
    return {
        "request_id": request_id,
        "duration_sec": 0.0,
        "top_styles": [],
        "all_above_threshold": [],
        "segment": _build_empty_segment(segment_mode, drop_strategy, drop_seconds, candidate_top_n),
        "model_info": model_info,
        "candidate_top_styles": [],
        "dj_style": None,
        "dj_confidence": None,
        "dj_reason": None,
        "reranked_top_styles": None,
        "segment_strategy_used": None,
        "filename_raw": filename_raw,
        "filename_original": filename_original,
        "filename_display": filename_display,
        "filename_decode": filename_decode,
        "error": {"code": error_code, "message": error_message, "detail": error_detail},
    }


@router.get("/health", response_model=HealthResponse)
async def health(request: Request):
    service = request.app.state.model_service
    return {
        "status": "ok",
        "model_loaded": service.is_loaded,
        "label_count": service.label_count,
        "output_dim": service.output_dim,
        "backbone_output_dim": service.backbone_output_dim,
        "head_enabled": service.head_enabled,
        "head_output_dim": service.head_output_dim,
    }


@router.post("/predict", response_model=PredictResponse)
async def predict(
    request: Request,
    file: UploadFile = File(...),
    original_name: Optional[str] = Form(default=None),
    top_k: Optional[int] = Query(default=None, ge=1, le=100),
    threshold: Optional[float] = Query(default=None, ge=0.0, le=1.0),
    clip_seconds: Optional[float] = Query(default=None, gt=0.0, le=600.0),
    segment_mode: str = Query(default="drop"),
    drop_strategy: str = Query(default="energy"),
    drop_seconds: Optional[float] = Query(default=None, gt=0.0, le=600.0),
    drop_candidate_top_n: Optional[int] = Query(default=None, ge=1, le=3),
    drop_merge_top_n: Optional[int] = Query(default=None, ge=1, le=3),
):
    settings = get_settings()
    service = request.app.state.model_service
    request_id = str(uuid.uuid4())
    start = time.monotonic()

    if not service.is_loaded:
        raise HTTPException(status_code=503, detail="model not loaded")
    if segment_mode not in {"drop", "full"}:
        raise HTTPException(status_code=400, detail="invalid segment_mode")
    if drop_strategy not in {"energy"}:
        raise HTTPException(status_code=400, detail="invalid drop_strategy")

    top_k_value = top_k if top_k is not None else settings.top_k_default
    top_k_rule = max(top_k_value, settings.dj_rules_top_k)
    threshold_value = threshold if threshold is not None else settings.threshold_default
    clip_value = clip_seconds if clip_seconds is not None else settings.default_clip_seconds

    filename_display, filename_decode = resolve_display_filename(file.filename, original_name)
    log_event(
        logger,
        "upload_filename",
        request_id=request_id,
        filename_raw=file.filename,
        filename_original=original_name,
        filename_display=filename_display,
        decode_method=filename_decode.get("method"),
        decode_success=filename_decode.get("success"),
    )

    candidate_top_n = drop_candidate_top_n if drop_candidate_top_n is not None else drop_merge_top_n
    tmp_path = _save_upload_to_temp(file, settings.max_upload_bytes)
    try:
        with anyio.fail_after(settings.request_timeout_sec):
            top_styles_full, all_above, duration_sec, segment_info, candidate_top_styles = await anyio.to_thread.run_sync(
                service.predict_from_file,
                tmp_path,
                clip_value,
                top_k_rule,
                threshold_value,
                segment_mode,
                drop_strategy,
                drop_seconds,
                candidate_top_n,
            )
    except TimeoutError:
        log_event(
            logger,
            "analysis_failed",
            request_id=request_id,
            filename=filename_display,
            error_code="ANALYSIS_TIMEOUT",
            error_message="prediction timeout",
        )
        return _error_response(
            request_id,
            file.filename,
            original_name,
            filename_display,
            filename_decode,
            segment_mode,
            drop_strategy,
            drop_seconds,
            candidate_top_n,
            service.model_info(),
            "ANALYSIS_TIMEOUT",
            "prediction timeout",
        )
    except Exception as exc:
        log_event(
            logger,
            "analysis_failed",
            request_id=request_id,
            filename=filename_display,
            error_code="ANALYSIS_FAILED",
            error_message=str(exc),
        )
        return _error_response(
            request_id,
            file.filename,
            original_name,
            filename_display,
            filename_decode,
            segment_mode,
            drop_strategy,
            drop_seconds,
            candidate_top_n,
            service.model_info(),
            "ANALYSIS_FAILED",
            "analysis failed",
            str(exc),
        )
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass

    elapsed = time.monotonic() - start
    top_styles = top_styles_full[:top_k_value]
    top1 = top_styles[0].style if top_styles else None
    top2 = top_styles[1].style if len(top_styles) > 1 else None
    top3 = top_styles[2].style if len(top_styles) > 2 else None
    candidate_summary = _summarize_styles(candidate_top_styles or [], limit=3)
    bpm_estimate = _extract_bpm_from_filename(filename_display)
    dj_resolution = resolve_dj_style(
        top_styles,
        segment_info,
        bpm_estimate=bpm_estimate,
        extra_candidates=top_styles_full,
    )
    log_event(
        logger,
        "prediction",
        request_id=request_id,
        duration_sec=duration_sec,
        elapsed_sec=elapsed,
        top1=top1,
        top2=top2,
        top3=top3,
        top_styles=_summarize_styles(top_styles, limit=3),
        candidate_top_styles=candidate_summary,
        filename=filename_display,
    )
    log_event(
        logger,
        "dj_resolution",
        request_id=request_id,
        filename=filename_display,
        top1=top1,
        top2=top2,
        top3=top3,
        dj_style=dj_resolution.dj_style,
        dj_confidence=dj_resolution.dj_confidence,
        hit_rules=dj_resolution.hit_rules,
        suggested_segment_strategy=dj_resolution.suggested_segment_strategy,
        bpm_estimate=bpm_estimate,
    )

    response = {
        "request_id": request_id,
        "duration_sec": duration_sec,
        "top_styles": _serialize_predictions(top_styles),
        "all_above_threshold": _serialize_predictions(all_above),
        "segment": segment_info,
        "model_info": service.model_info(),
        "dj_style": dj_resolution.dj_style,
        "dj_confidence": dj_resolution.dj_confidence,
        "dj_reason": dj_resolution.dj_reason,
        "segment_strategy_used": dj_resolution.segment_strategy_used,
        "filename_raw": file.filename,
        "filename_original": original_name,
        "filename_display": filename_display,
        "filename_decode": filename_decode,
        "error": None,
    }
    if dj_resolution.reranked_top_styles:
        response["reranked_top_styles"] = _serialize_predictions(dj_resolution.reranked_top_styles)
    if candidate_top_styles:
        response["candidate_top_styles"] = _serialize_predictions(candidate_top_styles)
    return response


@router.post("/predict/batch", response_model=List[PredictResponse])
async def predict_batch(
    request: Request,
    files: List[UploadFile] = File(...),
    original_name: Optional[List[str]] = Form(default=None),
    top_k: Optional[int] = Query(default=None, ge=1, le=100),
    threshold: Optional[float] = Query(default=None, ge=0.0, le=1.0),
    clip_seconds: Optional[float] = Query(default=None, gt=0.0, le=600.0),
    segment_mode: str = Query(default="drop"),
    drop_strategy: str = Query(default="energy"),
    drop_seconds: Optional[float] = Query(default=None, gt=0.0, le=600.0),
    drop_candidate_top_n: Optional[int] = Query(default=None, ge=1, le=3),
    drop_merge_top_n: Optional[int] = Query(default=None, ge=1, le=3),
):
    settings = get_settings()
    service = request.app.state.model_service

    if not service.is_loaded:
        raise HTTPException(status_code=503, detail="model not loaded")
    if len(files) > settings.max_batch_files:
        raise HTTPException(status_code=400, detail="too many files")
    if segment_mode not in {"drop", "full"}:
        raise HTTPException(status_code=400, detail="invalid segment_mode")
    if drop_strategy not in {"energy"}:
        raise HTTPException(status_code=400, detail="invalid drop_strategy")

    top_k_value = top_k if top_k is not None else settings.top_k_default
    top_k_rule = max(top_k_value, settings.dj_rules_top_k)
    threshold_value = threshold if threshold is not None else settings.threshold_default
    clip_value = clip_seconds if clip_seconds is not None else settings.default_clip_seconds

    responses = []
    original_names = original_name or []
    for index, upload in enumerate(files):
        request_id = str(uuid.uuid4())
        provided_original = original_names[index] if index < len(original_names) else None
        filename_display, filename_decode = resolve_display_filename(upload.filename, provided_original)
        log_event(
            logger,
            "upload_filename",
            request_id=request_id,
            filename_raw=upload.filename,
            filename_original=provided_original,
            filename_display=filename_display,
            decode_method=filename_decode.get("method"),
            decode_success=filename_decode.get("success"),
        )
        candidate_top_n = drop_candidate_top_n if drop_candidate_top_n is not None else drop_merge_top_n
        try:
            tmp_path = _save_upload_to_temp(upload, settings.max_upload_bytes)
        except HTTPException as exc:
            error_code = "UPLOAD_FAILED"
            if exc.status_code == 413:
                error_code = "FILE_TOO_LARGE"
            responses.append(
                _error_response(
                    request_id,
                    upload.filename,
                    provided_original,
                    filename_display,
                    filename_decode,
                    segment_mode,
                    drop_strategy,
                    drop_seconds,
                    drop_candidate_top_n if drop_candidate_top_n is not None else drop_merge_top_n,
                    service.model_info(),
                    error_code,
                    str(exc.detail),
                    str(exc.detail),
                )
            )
            continue
        try:
            with anyio.fail_after(settings.request_timeout_sec):
                top_styles_full, all_above, duration_sec, segment_info, candidate_top_styles = await anyio.to_thread.run_sync(
                    service.predict_from_file,
                    tmp_path,
                    clip_value,
                    top_k_rule,
                    threshold_value,
                    segment_mode,
                    drop_strategy,
                    drop_seconds,
                    candidate_top_n,
                )
        except TimeoutError:
            log_event(
                logger,
                "analysis_failed",
                request_id=request_id,
                filename=filename_display,
                error_code="ANALYSIS_TIMEOUT",
                error_message="prediction timeout",
            )
            responses.append(
                _error_response(
                    request_id,
                    upload.filename,
                    provided_original,
                    filename_display,
                    filename_decode,
                    segment_mode,
                    drop_strategy,
                    drop_seconds,
                    candidate_top_n,
                    service.model_info(),
                    "ANALYSIS_TIMEOUT",
                    "prediction timeout",
                )
            )
            continue
        except Exception as exc:
            log_event(
                logger,
                "analysis_failed",
                request_id=request_id,
                filename=filename_display,
                error_code="ANALYSIS_FAILED",
                error_message=str(exc),
            )
            responses.append(
                _error_response(
                    request_id,
                    upload.filename,
                    provided_original,
                    filename_display,
                    filename_decode,
                    segment_mode,
                    drop_strategy,
                    drop_seconds,
                    candidate_top_n,
                    service.model_info(),
                    "ANALYSIS_FAILED",
                    "analysis failed",
                    str(exc),
                )
            )
            continue
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass

        top_styles = top_styles_full[:top_k_value]
        top1 = top_styles[0].style if top_styles else None
        top2 = top_styles[1].style if len(top_styles) > 1 else None
        top3 = top_styles[2].style if len(top_styles) > 2 else None
        candidate_summary = _summarize_styles(candidate_top_styles or [], limit=3)
        bpm_estimate = _extract_bpm_from_filename(filename_display)
        dj_resolution = resolve_dj_style(
            top_styles,
            segment_info,
            bpm_estimate=bpm_estimate,
            extra_candidates=top_styles_full,
        )
        log_event(
            logger,
            "prediction",
            request_id=request_id,
            duration_sec=duration_sec,
            elapsed_sec=None,
            top1=top1,
            top2=top2,
            top3=top3,
            top_styles=_summarize_styles(top_styles, limit=3),
            candidate_top_styles=candidate_summary,
            filename=filename_display,
        )
        log_event(
            logger,
            "dj_resolution",
            request_id=request_id,
            filename=filename_display,
            top1=top1,
            top2=top2,
            top3=top3,
            dj_style=dj_resolution.dj_style,
            dj_confidence=dj_resolution.dj_confidence,
            hit_rules=dj_resolution.hit_rules,
            suggested_segment_strategy=dj_resolution.suggested_segment_strategy,
            bpm_estimate=bpm_estimate,
        )

        response = {
            "request_id": request_id,
            "duration_sec": duration_sec,
            "top_styles": _serialize_predictions(top_styles),
            "all_above_threshold": _serialize_predictions(all_above),
            "segment": segment_info,
            "model_info": service.model_info(),
            "dj_style": dj_resolution.dj_style,
            "dj_confidence": dj_resolution.dj_confidence,
            "dj_reason": dj_resolution.dj_reason,
            "segment_strategy_used": dj_resolution.segment_strategy_used,
            "filename_raw": upload.filename,
            "filename_original": provided_original,
            "filename_display": filename_display,
            "filename_decode": filename_decode,
            "error": None,
        }
        if dj_resolution.reranked_top_styles:
            response["reranked_top_styles"] = _serialize_predictions(dj_resolution.reranked_top_styles)
        if candidate_top_styles:
            response["candidate_top_styles"] = _serialize_predictions(candidate_top_styles)
        responses.append(response)

    return responses
