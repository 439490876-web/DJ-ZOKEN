from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache


def _get_env(name: str, default):
    value = os.getenv(name)
    if value is None:
        return default
    return value


def _get_int(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None:
        return default
    return int(value)


def _get_float(name: str, default: float) -> float:
    value = os.getenv(name)
    if value is None:
        return default
    return float(value)


def _get_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.lower() in {"1", "true", "yes", "on"}


def _get_choice(name: str, default: str, choices: set[str]) -> str:
    value = os.getenv(name)
    if value is None:
        return default
    value = value.strip().lower()
    return value if value in choices else default


@dataclass(frozen=True)
class Settings:
    model_dir: str
    model_onnx: str
    model_json: str
    model_url_base: str
    model_head_onnx: str
    model_head_json: str
    model_head_url_base: str
    enable_classification_head: str
    head_expected_dim: int
    use_essentia: bool
    require_essentia: bool
    download_timeout: float
    download_retries: int
    ffmpeg_bin: str

    default_clip_seconds: float
    pad_mode: str

    n_mels: int
    frame_size: int
    hop_size: int
    patch_frames: int
    patch_hop_frames: int

    top_k_default: int
    threshold_default: float
    drop_seconds: float
    drop_pre_roll_sec: float
    drop_top_n: int
    drop_candidates_k: int
    drop_hop_sec: float
    drop_frame_sec: float
    drop_smooth_sec: float
    drop_w1: float
    drop_w2: float
    drop_w3: float
    drop_w4: float
    candidate_score_w_gap: float
    candidate_score_w_entropy: float
    candidate_score_w_fb: float
    drop_low_freq_min: float
    drop_low_freq_max: float
    drop_high_freq_max: float
    drop_min_duration_margin: float
    future_bass_rerank: bool
    future_bass_rerank_threshold: float
    future_bass_rerank_max_boost: float
    future_bass_score_w_sidechain: float
    future_bass_score_w_high: float
    future_bass_score_w_sub: float

    max_upload_mb: int
    max_batch_files: int
    request_timeout_sec: float

    onnx_intra_op_threads: int
    onnx_inter_op_threads: int
    onnx_graph_optimization: str

    log_level: str
    preload_model: bool
    dj_rules_top_k: int
    dj_latin_override_min: float
    dj_latin_override_ratio: float
    dj_latin_score_multiplier: float
    dj_latin_score_reggaeton: float
    dj_latin_score_latin: float
    dj_latin_score_mpb: float
    dj_latin_conf_base: float
    dj_latin_conf_scale: float
    dj_latin_conf_max: float
    dj_rerank_suppress_mult: float
    dj_rerank_latin_boost: float
    dj_trap_bpm_min: float
    dj_trap_bpm_max: float
    dj_trap_double_min: float
    dj_trap_double_max: float
    dj_trap_conf_base: float
    dj_trap_conf_scale: float
    dj_trap_conf_max: float
    dj_fallback_conf_base: float
    dj_fallback_conf_scale: float
    dj_fallback_conf_max: float
    dj_uncertain_gap_max: float

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings(
        model_dir=_get_env("MODEL_DIR", "./models"),
        model_onnx=_get_env("MODEL_ONNX", "discogs-effnet-bsdynamic-1.onnx"),
        model_json=_get_env("MODEL_JSON", "discogs-effnet-bsdynamic-1.json"),
        model_url_base=_get_env(
            "MODEL_URL_BASE",
            "https://essentia.upf.edu/models/music-style-classification/discogs-effnet",
        ),
        model_head_onnx=_get_env("MODEL_HEAD_ONNX", "genre_discogs400.onnx"),
        model_head_json=_get_env("MODEL_HEAD_JSON", "genre_discogs400.json"),
        model_head_url_base=_get_env(
            "MODEL_HEAD_URL_BASE",
            "https://essentia.upf.edu/models/music-style-classification/genre_discogs400",
        ),
        enable_classification_head=_get_choice(
            "ENABLE_CLASSIFICATION_HEAD", "auto", {"auto", "true", "false"}
        ),
        head_expected_dim=_get_int("HEAD_EXPECTED_DIM", 400),
        use_essentia=_get_bool("USE_ESSENTIA", True),
        require_essentia=_get_bool("REQUIRE_ESSENTIA", False),
        download_timeout=_get_float("MODEL_DOWNLOAD_TIMEOUT", 30.0),
        download_retries=_get_int("MODEL_DOWNLOAD_RETRIES", 3),
        ffmpeg_bin=_get_env("FFMPEG_BIN", "ffmpeg"),
        default_clip_seconds=_get_float("DEFAULT_CLIP_SECONDS", 30.0),
        pad_mode=_get_env("PAD_MODE", "zero"),
        n_mels=_get_int("N_MELS", 128),
        frame_size=_get_int("FRAME_SIZE", 400),
        hop_size=_get_int("HOP_SIZE", 160),
        patch_frames=_get_int("PATCH_FRAMES", 96),
        patch_hop_frames=_get_int("PATCH_HOP_FRAMES", 96),
        top_k_default=_get_int("TOP_K_DEFAULT", 10),
        threshold_default=_get_float("THRESHOLD_DEFAULT", 0.1),
        drop_seconds=_get_float("DEFAULT_DROP_SECONDS", _get_float("DROP_SECONDS", 20.0)),
        drop_pre_roll_sec=_get_float("DROP_PRE_ROLL_SEC", 10.0),
        drop_top_n=_get_int("DROP_TOP_N_PEAKS", _get_int("DROP_TOP_N", 5)),
        drop_candidates_k=_get_int("DROP_CANDIDATES_K", _get_int("DROP_TOP_N_PEAKS", 5)),
        drop_hop_sec=_get_float("DROP_HOP_SEC", 0.1),
        drop_frame_sec=_get_float("DROP_FRAME_SEC", 0.2),
        drop_smooth_sec=_get_float("DROP_SMOOTH_SEC", 4.0),
        drop_w1=_get_float("DROP_SCORE_W_ENERGY", _get_float("DROP_W1", 1.0)),
        drop_w2=_get_float("DROP_SCORE_W_LOW_BAND", _get_float("DROP_W2", 0.6)),
        drop_w3=_get_float("DROP_SCORE_W_FLUX", _get_float("DROP_W3", 0.4)),
        drop_w4=_get_float("DROP_SCORE_W_VARIANCE", _get_float("DROP_W4", 0.2)),
        candidate_score_w_gap=_get_float("CANDIDATE_SCORE_W_GAP", 1.0),
        candidate_score_w_entropy=_get_float("CANDIDATE_SCORE_W_ENTROPY", 0.15),
        candidate_score_w_fb=_get_float("CANDIDATE_SCORE_W_FB", 0.25),
        drop_low_freq_min=_get_float("DROP_LOW_FREQ_MIN", 20.0),
        drop_low_freq_max=_get_float("DROP_LOW_FREQ_MAX", 150.0),
        drop_high_freq_max=_get_float("DROP_HIGH_FREQ_MAX", 8000.0),
        drop_min_duration_margin=_get_float("DROP_MIN_DURATION_MARGIN", 5.0),
        future_bass_rerank=_get_bool("FUTURE_BASS_RERANK", True),
        future_bass_rerank_threshold=_get_float("FUTURE_BASS_RERANK_THRESHOLD", 0.55),
        future_bass_rerank_max_boost=_get_float("FUTURE_BASS_RERANK_MAX_BOOST", 1.25),
        future_bass_score_w_sidechain=_get_float("FUTURE_BASS_SCORE_W_SIDECHAIN", 0.4),
        future_bass_score_w_high=_get_float("FUTURE_BASS_SCORE_W_HIGH", 0.3),
        future_bass_score_w_sub=_get_float("FUTURE_BASS_SCORE_W_SUB", 0.3),
        max_upload_mb=_get_int("MAX_UPLOAD_MB", 50),
        max_batch_files=_get_int("MAX_BATCH_FILES", 8),
        request_timeout_sec=_get_float("REQUEST_TIMEOUT_SEC", 30.0),
        onnx_intra_op_threads=_get_int("ONNX_INTRA_OP_THREADS", 1),
        onnx_inter_op_threads=_get_int("ONNX_INTER_OP_THREADS", 1),
        onnx_graph_optimization=_get_env("ONNX_GRAPH_OPT", "ALL"),
        log_level=_get_env("LOG_LEVEL", "INFO"),
        preload_model=_get_bool("PRELOAD_MODEL", True),
        dj_rules_top_k=_get_int("DJ_RULES_TOP_K", 50),
        dj_latin_override_min=_get_float("DJ_LATIN_OVERRIDE_MIN", 0.08),
        dj_latin_override_ratio=_get_float("DJ_LATIN_OVERRIDE_RATIO", 0.4),
        dj_latin_score_multiplier=_get_float("DJ_LATIN_SCORE_MULTIPLIER", 1.5),
        dj_latin_score_reggaeton=_get_float("DJ_LATIN_SCORE_REGGAETON", 2.0),
        dj_latin_score_latin=_get_float("DJ_LATIN_SCORE_LATIN", 1.2),
        dj_latin_score_mpb=_get_float("DJ_LATIN_SCORE_MPB", 1.0),
        dj_latin_conf_base=_get_float("DJ_LATIN_CONF_BASE", 0.55),
        dj_latin_conf_scale=_get_float("DJ_LATIN_CONF_SCALE", 2.0),
        dj_latin_conf_max=_get_float("DJ_LATIN_CONF_MAX", 0.95),
        dj_rerank_suppress_mult=_get_float("DJ_RERANK_SUPPRESS_MULT", 0.5),
        dj_rerank_latin_boost=_get_float("DJ_RERANK_LATIN_BOOST", 0.03),
        dj_trap_bpm_min=_get_float("DJ_TRAP_BPM_MIN", 95.0),
        dj_trap_bpm_max=_get_float("DJ_TRAP_BPM_MAX", 110.0),
        dj_trap_double_min=_get_float("DJ_TRAP_DOUBLE_MIN", 190.0),
        dj_trap_double_max=_get_float("DJ_TRAP_DOUBLE_MAX", 220.0),
        dj_trap_conf_base=_get_float("DJ_TRAP_CONF_BASE", 0.65),
        dj_trap_conf_scale=_get_float("DJ_TRAP_CONF_SCALE", 0.3),
        dj_trap_conf_max=_get_float("DJ_TRAP_CONF_MAX", 0.95),
        dj_fallback_conf_base=_get_float("DJ_FALLBACK_CONF_BASE", 0.5),
        dj_fallback_conf_scale=_get_float("DJ_FALLBACK_CONF_SCALE", 0.5),
        dj_fallback_conf_max=_get_float("DJ_FALLBACK_CONF_MAX", 0.9),
        dj_uncertain_gap_max=_get_float("DJ_UNCERTAIN_GAP_MAX", 0.08),
    )
