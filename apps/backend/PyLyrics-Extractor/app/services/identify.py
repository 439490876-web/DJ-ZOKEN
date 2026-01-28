from __future__ import annotations

import hashlib
import logging
import os
import subprocess
import tempfile
import time
from typing import Any, Dict, List, Optional, Tuple

from mutagen import File as MutagenFile

from ..clients.base import BaseClient, Candidate
from ..clients.mock_douyin import MockDouyinClient
from ..clients.mock_netease import MockNeteaseClient
from ..clients.netease_enhanced import NeteaseEnhancedClient
from ..db.sqlite import SQLiteStore
from ..models import Evidence, EvidenceCandidate, IdentifyResponse, MasterTrack, PlatformMatch
from .cleaning import (
    CleanResult,
    clean_track,
    is_dj_edit_mode,
    normalize_basic,
    normalize_query_text,
    split_artist_title,
)
from .scoring import (
    InputTrack,
    compute_heat_score,
    decision_from_score,
    normalize_netease_metrics,
    select_best_candidate,
)

logger = logging.getLogger(__name__)

NETEASE_DETAIL_TTL_SEC = 600
_NETEASE_DETAIL_CACHE: Dict[str, Tuple[float, Dict[str, Any]]] = {}


class OnlineHeatRequiredError(RuntimeError):
    def __init__(
        self,
        reason: str,
        message: str,
        *,
        ncm_status: Optional[str] = None,
        http_error_code: Optional[int] = None,
        error_message: Optional[str] = None,
        base_url: Optional[str] = None,
    ) -> None:
        super().__init__(message)
        self.reason = reason
        self.message = message
        self.ncm_status = ncm_status
        self.http_error_code = http_error_code
        self.error_message = error_message
        self.base_url = base_url


def _is_online_heat_required() -> bool:
    return True


def _build_online_error(
    *,
    ncm_status: Optional[str],
    http_error_code: Optional[int],
    error_message: Optional[str],
    base_url: Optional[str],
) -> OnlineHeatRequiredError:
    reason = ncm_status or "netease_unavailable"
    parts = [f"ncm_status={reason}"]
    if http_error_code:
        parts.append(f"http_error_code={http_error_code}")
    if error_message:
        parts.append(f"error={error_message}")
    if base_url:
        parts.append(f"base_url={base_url}")
    message = "online_heat_required: " + ", ".join(parts)
    return OnlineHeatRequiredError(
        reason=reason,
        message=message,
        ncm_status=ncm_status,
        http_error_code=http_error_code,
        error_message=error_message,
        base_url=base_url,
    )


def _build_clients() -> Tuple[List[BaseClient], str, Optional[str]]:
    netease_client = NeteaseEnhancedClient()
    netease_source = "enhanced_api"
    base_url = getattr(netease_client, "base_url", None)
    return [netease_client, MockDouyinClient()], netease_source, base_url


def _netease_meta(client: Optional[BaseClient]) -> Tuple[bool, Optional[int], Optional[str], bool, bool]:
    if not client:
        return False, None, None, False, False
    used_fallback = bool(getattr(client, "used_fallback_base_url", False))
    error_code = getattr(client, "last_error_code", None)
    error_message = getattr(client, "last_error_message", None)
    circuit_open = bool(getattr(client, "circuit_open", False))
    last_failed = bool(getattr(client, "last_request_failed", False))
    return used_fallback, error_code, error_message, circuit_open, last_failed


def _get_cached_netease_detail(
    song_id: str,
) -> Tuple[Optional[Dict[str, Any]], Optional[int]]:
    now = time.time()
    cached = _NETEASE_DETAIL_CACHE.get(song_id)
    if not cached:
        return None, None
    expires_at, payload = cached
    if expires_at <= now:
        _NETEASE_DETAIL_CACHE.pop(song_id, None)
        return None, None
    ttl_left = max(0, int(round(expires_at - now)))
    return payload, ttl_left


def _set_cached_netease_detail(song_id: str, payload: Dict[str, Any]) -> None:
    _NETEASE_DETAIL_CACHE[song_id] = (time.time() + NETEASE_DETAIL_TTL_SEC, payload)


def _fetch_netease_detail(
    client: BaseClient, song_id: str
) -> Tuple[Optional[Dict[str, Any]], bool, Optional[int]]:
    if not song_id:
        return None, False, None
    cached, ttl_left = _get_cached_netease_detail(song_id)
    if cached:
        return cached, True, ttl_left
    detail = None
    if hasattr(client, "fetch_track_detail"):
        try:
            detail = client.fetch_track_detail(song_id)  # type: ignore[attr-defined]
        except Exception as exc:
            logger.warning("netease detail fetch failed: %s", exc)
            detail = None
    if isinstance(detail, dict):
        _set_cached_netease_detail(song_id, detail)
        return detail, False, None
    return None, False, None



def _first_tag(tags, keys: Tuple[str, ...]) -> Optional[str]:
    for key in keys:
        value = None
        try:
            if hasattr(tags, "get"):
                value = tags.get(key)
            else:
                value = tags[key]  # type: ignore[index]
        except Exception:
            value = None
        if isinstance(value, (list, tuple)):
            value = value[0] if value else None
        if value is None:
            continue
        text = str(value).strip()
        if text:
            return text
    return None


def _read_tags(file_path: str) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    try:
        audio = MutagenFile(file_path)
    except Exception:
        return None, None, None
    if not audio or not getattr(audio, "tags", None):
        return None, None, None
    tags = audio.tags
    title = _first_tag(tags, ("TIT2", "title", "TITLE", "\xa9nam", "©nam"))
    artist = _first_tag(tags, ("TPE1", "artist", "ARTIST", "\xa9ART", "©ART", "aART"))
    isrc = _first_tag(tags, ("TSRC", "isrc", "ISRC", "----:com.apple.iTunes:ISRC"))
    return title, artist, isrc



def _duration_ms_ffprobe(file_path: str) -> Optional[int]:
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=nk=1:nw=1",
        file_path,
    ]
    try:
        output = subprocess.check_output(cmd, stderr=subprocess.DEVNULL, text=True).strip()
        if not output:
            return None
        seconds = float(output)
        return int(round(seconds)) * 1000
    except Exception:
        return None


def _duration_ms_fallback(file_path: str) -> Optional[int]:
    try:
        audio = MutagenFile(file_path)
    except Exception:
        return None
    if not audio or not getattr(audio, "info", None):
        return None
    length = getattr(audio.info, "length", None)
    if not length:
        return None
    return int(round(float(length))) * 1000


def get_duration_ms(file_path: str) -> Optional[int]:
    duration = _duration_ms_ffprobe(file_path)
    if duration is not None:
        return duration
    return _duration_ms_fallback(file_path)


def _duration_bucket(duration_ms: Optional[int]) -> str:
    if not duration_ms:
        return "0"
    bucket = int(round(duration_ms / 2000.0)) * 2
    return str(bucket)


ENGINEERING_TOKENS = {
    "mix",
    "phase",
    "aligned",
    "structural",
    "master",
    "render",
    "final",
    "export",
    "bounce",
    "bounced",
    "stem",
    "stems",
    "analysis",
    "analyzed",
    "bpm",
    "lock",
    "locked",
    "cue",
    "backup",
    "algorithm",
    "layered",
    "smart",
}


def _is_insufficient_title_metadata(
    query_title: str, raw_title: str, filename: str
) -> bool:
    if not query_title or len(query_title) < 3:
        return True
    combined = normalize_query_text(f"{raw_title} {filename}")
    tokens = combined.split()
    if not tokens:
        return True
    engineering_hits = 0
    for token in tokens:
        if token in ENGINEERING_TOKENS:
            engineering_hits += 1
            continue
        if token.startswith("v") and token[1:].isdigit():
            engineering_hits += 1
            continue
        if token.startswith("take") and token[4:].isdigit():
            engineering_hits += 1
            continue
    return engineering_hits / len(tokens) >= 0.5


def compute_master_track_id(query_artist: str, query_title: str, duration_ms: Optional[int]) -> str:
    payload = f"{query_artist}|{query_title}|{_duration_bucket(duration_ms)}"
    digest = hashlib.sha1(payload.encode("utf-8")).hexdigest()
    return f"mt_{digest[:16]}"


def compute_file_sig(file_path: str, duration_ms: Optional[int]) -> str:
    size = os.path.getsize(file_path)
    with open(file_path, "rb") as handle:
        chunk = handle.read(65536)
    h = hashlib.sha1()
    h.update(str(size).encode("utf-8"))
    h.update(str(duration_ms or 0).encode("utf-8"))
    h.update(chunk)
    return h.hexdigest()


def _compute_file_fingerprint(file_path: str, file_bytes: Optional[bytes]) -> str:
    h = hashlib.sha1()
    if file_bytes:
        h.update(file_bytes)
        return h.hexdigest()
    with open(file_path, "rb") as handle:
        while True:
            chunk = handle.read(1024 * 1024)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def build_queries(clean_result: CleanResult, isrc: Optional[str]) -> List[str]:
    queries: List[str] = []
    if clean_result.query_artist and clean_result.query_title:
        queries.append(f"{clean_result.query_artist} {clean_result.query_title}")
        queries.append(f"{clean_result.query_title} {clean_result.query_artist}")
    if clean_result.query_title:
        queries.append(clean_result.query_title)
    if isrc:
        queries.append(f"isrc:{isrc}")
    deduped: List[str] = []
    for query in queries:
        query = normalize_basic(query)
        if query and query not in deduped:
            deduped.append(query)
    return deduped[:6]


def _collect_candidates(
    client: BaseClient, queries: List[str], limit: int = 20
) -> Tuple[List[Candidate], List[str]]:
    seen: Dict[str, Candidate] = {}
    used_queries: List[str] = []
    for query in queries:
        used_queries.append(query)
        for candidate in client.search_tracks(query, limit=limit):
            if candidate.track_id not in seen:
                seen[candidate.track_id] = candidate
    return list(seen.values()), used_queries


def _build_evidence_candidates(scored) -> List[EvidenceCandidate]:
    evidence = []
    for item in scored[:5]:
        evidence.append(
            EvidenceCandidate(
                track_id=item.candidate.track_id,
                title=item.candidate.title,
                artist=item.candidate.artist,
                duration_ms=item.candidate.duration_ms,
                score=item.score,
                popularity=item.candidate.popularity,
            )
        )
    return evidence


def identify_file(
    file_path: str,
    filename: str,
    store: SQLiteStore,
    debug: bool = False,
    *,
    file_bytes: Optional[bytes] = None,
) -> IdentifyResponse:
    tag_title, tag_artist, isrc = _read_tags(file_path)
    duration_ms = get_duration_ms(file_path)

    used_tags = bool(tag_title or tag_artist)
    used_filename = not bool(tag_title)

    filename_title = os.path.splitext(filename)[0]
    raw_title = tag_title or filename_title
    raw_artist = tag_artist
    alt_raw_title: Optional[str] = None
    alt_raw_artist: Optional[str] = None

    artist_guess, title_guess, _ = split_artist_title(filename_title)
    if artist_guess and title_guess:
        tag_title_norm = normalize_basic(tag_title or "").strip().lower()
        tag_artist_norm = normalize_basic(tag_artist or "").strip().lower()
        artist_guess_norm = normalize_basic(artist_guess).strip().lower()
        title_guess_norm = normalize_basic(title_guess).strip().lower()

        filename_is_title_artist = bool(
            tag_title_norm
            and tag_artist_norm
            and tag_title_norm == artist_guess_norm
            and tag_artist_norm == title_guess_norm
        )

        if filename_is_title_artist:
            # Filename looks like "title-artist"; keep the tag ordering.
            raw_title = tag_title or raw_title
            raw_artist = tag_artist or raw_artist
        else:
            # If the filename encodes "artist - title", prefer that split even when tags are noisy.
            raw_title = title_guess if title_guess else raw_title
            if not raw_artist or raw_artist.strip().lower() == raw_title.strip().lower():
                raw_artist = artist_guess
            used_filename = True

            if not used_tags:
                alt_raw_title = artist_guess
                alt_raw_artist = title_guess

    clean_result = clean_track(raw_title, raw_artist)
    dj_edit_mode = is_dj_edit_mode(raw_title, clean_result.clean_title, filename_title)
    insufficient_title_metadata = _is_insufficient_title_metadata(
        clean_result.query_title, raw_title, filename_title
    )
    if clean_result.stripped_dj_tags and len(clean_result.query_title.split()) <= 2:
        insufficient_title_metadata = True

    input_track = InputTrack(
        clean_title=clean_result.clean_title,
        clean_artist=clean_result.clean_artist,
        query_title=clean_result.query_title,
        query_artist=clean_result.query_artist,
        duration_ms=duration_ms,
        feat_artists=clean_result.feat_artists,
        dj_edit_mode=dj_edit_mode,
    )

    alt_clean_result: Optional[CleanResult] = None
    alt_input_track: Optional[InputTrack] = None
    alt_dj_edit_mode = False
    alt_insufficient_title_metadata = False
    if alt_raw_title and alt_raw_artist:
        alt_clean_result = clean_track(alt_raw_title, alt_raw_artist)
        alt_dj_edit_mode = is_dj_edit_mode(
            alt_raw_title, alt_clean_result.clean_title, filename_title
        )
        alt_insufficient_title_metadata = _is_insufficient_title_metadata(
            alt_clean_result.query_title, alt_raw_title, filename_title
        )
        if alt_clean_result.stripped_dj_tags and len(alt_clean_result.query_title.split()) <= 2:
            alt_insufficient_title_metadata = True
        alt_input_track = InputTrack(
            clean_title=alt_clean_result.clean_title,
            clean_artist=alt_clean_result.clean_artist,
            query_title=alt_clean_result.query_title,
            query_artist=alt_clean_result.query_artist,
            duration_ms=duration_ms,
            feat_artists=alt_clean_result.feat_artists,
            dj_edit_mode=alt_dj_edit_mode,
        )

    file_fingerprint = _compute_file_fingerprint(file_path, file_bytes)
    file_sig = file_fingerprint
    master_track_id = compute_master_track_id(
        clean_result.query_artist, clean_result.query_title, duration_ms
    )
    query_sig = hashlib.sha1(
        f"{clean_result.query_artist}|{clean_result.query_title}|{_duration_bucket(duration_ms)}".encode(
            "utf-8"
        )
    ).hexdigest()

    if not debug and not alt_input_track:
        cached = store.get_cache(f"file:{file_sig}") or store.get_cache(f"query:{query_sig}")
        if cached and cached.get("heat"):
            evidence_cached = cached.get("evidence") or {}
            if evidence_cached.get("file_fingerprint") == file_fingerprint:
                evidence_cached["cached"] = True
                evidence_cached["cache_hit"] = True
                cached["evidence"] = evidence_cached
                return IdentifyResponse(**cached)

    queries = build_queries(clean_result, isrc)
    if alt_clean_result:
        for query in build_queries(alt_clean_result, isrc):
            if query not in queries:
                queries.append(query)
    logger.info("queries=%s", queries)

    platform_matches: Dict[str, Optional[PlatformMatch]] = {}
    top_candidates: Dict[str, List[EvidenceCandidate]] = {}
    max_confidence = 0.0
    remix_replaced_flag = False
    base_text_score_best: Dict[str, float] = {}
    popularity_best: Dict[str, float] = {}
    popularity_bonus_value: Dict[str, float] = {}
    popularity_bonus_applied: Dict[str, bool] = {}
    decision_rules: Dict[str, str] = {}
    duration_delta_best: Dict[str, Optional[int]] = {}
    duration_override_applied: Dict[str, bool] = {}
    duration_mode = "soft" if dj_edit_mode else "strict"
    decision_escalated_to_review = False
    decision_escalation_reason: Optional[str] = None
    any_platform_match = False
    any_platform_needs_review = False
    netease_best: Optional[Candidate] = None
    netease_confidence = 0.0
    netease_client: Optional[BaseClient] = None
    netease_low_confidence: Optional[float] = None
    orientation_swap_delta = 0.04

    clients, netease_source, netease_base_url = _build_clients()

    for client in clients:
        if client.platform == "netease":
            netease_client = client
        candidates, _ = _collect_candidates(client, queries)
        best, scored, remix_replaced, decision_rule, best_meta = select_best_candidate(
            input_track, candidates
        )
        if alt_input_track and client.platform == "netease" and candidates:
            alt_best, alt_scored, alt_remix_replaced, alt_decision_rule, alt_best_meta = (
                select_best_candidate(alt_input_track, candidates)
            )
            if alt_best and (not best or alt_best.score > best.score + orientation_swap_delta):
                input_track = alt_input_track
                if alt_clean_result:
                    clean_result = alt_clean_result
                if alt_raw_title:
                    raw_title = alt_raw_title
                if alt_raw_artist:
                    raw_artist = alt_raw_artist
                dj_edit_mode = alt_dj_edit_mode
                insufficient_title_metadata = alt_insufficient_title_metadata
                duration_mode = "soft" if dj_edit_mode else "strict"
                master_track_id = compute_master_track_id(
                    clean_result.query_artist, clean_result.query_title, duration_ms
                )
                query_sig = hashlib.sha1(
                    f"{clean_result.query_artist}|{clean_result.query_title}|{_duration_bucket(duration_ms)}".encode(
                        "utf-8"
                    )
                ).hexdigest()
                best = alt_best
                scored = alt_scored
                remix_replaced = alt_remix_replaced
                decision_rule = alt_decision_rule
                best_meta = alt_best_meta
        remix_replaced_flag = remix_replaced_flag or remix_replaced
        top_candidates[client.platform] = _build_evidence_candidates(scored)
        decision_rules[client.platform] = decision_rule

        if best:
            details = best.details or {}
            base_text_score_best[client.platform] = float(details.get("base_text_score") or 0.0)
            popularity_bonus_value[client.platform] = float(
                details.get("popularity_bonus_value") or 0.0
            )
            popularity_bonus_applied[client.platform] = bool(
                details.get("popularity_bonus_applied")
            )
            popularity_best[client.platform] = float(best.candidate.popularity or 0.0)
            duration_mode = details.get("duration_mode", duration_mode)
            duration_delta_best[client.platform] = details.get("duration_delta")
            duration_override_applied[client.platform] = bool(
                details.get("duration_override_applied")
            )
            confidence = best.score
            decision = decision_from_score(confidence)
            min_confidence = float(os.getenv("NETEASE_MIN_CONFIDENCE", "0.70"))
            if client.platform == "netease" and confidence < min_confidence:
                netease_best = None
                netease_confidence = confidence
                netease_client = client
                netease_low_confidence = confidence
                decision = "NO_MATCH"
                decision_escalated_to_review = True
                if decision_escalation_reason is None:
                    decision_escalation_reason = "NETEASE_LOW_CONFIDENCE"
            else:
                any_platform_match = True
                if client.platform == "netease":
                    netease_best = best.candidate
                    netease_confidence = confidence
                    netease_client = client

            base_text_score = float(details.get("base_text_score") or 0.0)
            trusted_pool_non_empty = bool(best_meta.get("trusted_pool_non_empty"))
            pop_rank = best_meta.get("trusted_pool_pop_rank")
            pop_top2_close = bool(best_meta.get("trusted_pool_pop_top2_close"))
            if (
                confidence < 0.70
                and trusted_pool_non_empty
                and base_text_score >= 0.75
                and (pop_rank == 1 or (pop_rank == 2 and pop_top2_close))
            ):
                decision = "NEEDS_REVIEW"
                decision_escalated_to_review = True
                decision_escalation_reason = "TRUSTED_POOL_POP_TOP"

            if insufficient_title_metadata and decision == "NO_MATCH":
                decision = "NEEDS_REVIEW"
                decision_escalated_to_review = True
                if decision_escalation_reason is None:
                    decision_escalation_reason = "INSUFFICIENT_TITLE_METADATA"

            if decision == "NEEDS_REVIEW":
                any_platform_needs_review = True
            max_confidence = max(max_confidence, confidence)
            if decision != "NO_MATCH":
                platform_matches[client.platform] = PlatformMatch(
                    track_id=best.candidate.track_id,
                    title=best.candidate.title,
                    artist=best.candidate.artist,
                    duration_ms=best.candidate.duration_ms,
                    score=best.score,
                )
            else:
                platform_matches[client.platform] = None
        else:
            decision = "NO_MATCH"
            platform_matches[client.platform] = None

        if best and decision != "NO_MATCH":
            store.upsert_platform_track(
                client.platform,
                {
                    "track_id": best.candidate.track_id,
                    "title": best.candidate.title,
                    "artist": best.candidate.artist,
                    "duration_ms": best.candidate.duration_ms,
                    "popularity": best.candidate.popularity,
                    "extra": best.candidate.extra,
                },
            )
            store.upsert_mapping(
                master_track_id,
                client.platform,
                best.candidate.track_id,
                best.score,
                best.score,
                decision,
            )
        else:
            store.upsert_mapping(
                master_track_id,
                client.platform,
                None,
                0.0,
                0.0,
                decision,
            )

    master_decision = decision_from_score(max_confidence)
    if master_decision == "NO_MATCH" and (
        any_platform_needs_review or (insufficient_title_metadata and any_platform_match)
    ):
        master_decision = "NEEDS_REVIEW"
    master_track = MasterTrack(
        master_track_id=master_track_id,
        clean_title=clean_result.clean_title,
        clean_artist=clean_result.clean_artist,
        query_title=clean_result.query_title,
        query_artist=clean_result.query_artist,
        duration_ms=duration_ms,
        confidence=max_confidence,
        decision=master_decision,
    )

    query_payload = {
        "raw_title": raw_title,
        "cleaned_title": clean_result.clean_title,
        "cleaned_artist": clean_result.clean_artist,
    }

    match_payload = None
    if netease_best:
        match_payload = {
            "platform": "netease",
            "song_id": netease_best.track_id,
            "name": netease_best.title,
            "artist": netease_best.artist,
            "confidence": netease_confidence,
        }

    detail_cache_hit = False
    detail_cache_ttl_left: Optional[int] = None
    heat_payload = None
    heat_debug = None
    heat_source = "netease"
    used_fallback_api, http_error_code, error_message, circuit_open, last_failed = _netease_meta(
        netease_client
    )
    ncm_status = "ok"
    has_remix_tag = bool(clean_result.version_tokens or clean_result.stripped_dj_tags)
    if netease_best and netease_client:
        try:
            detail, detail_cache_hit, detail_cache_ttl_left = _fetch_netease_detail(
                netease_client, netease_best.track_id
            )
            used_fallback_api, http_error_code, error_message, circuit_open, last_failed = (
                _netease_meta(netease_client)
            )
            if detail is None:
                ncm_status = "circuit_open" if circuit_open else "detail_failed"
            else:
                metrics = normalize_netease_metrics(detail or {})
                metrics["_raw_title"] = raw_title
                metrics["_cleaned_title"] = clean_result.clean_title
                computed = compute_heat_score(metrics, debug=True)
                computed_breakdown = computed.get("breakdown") if isinstance(computed, dict) else None
                heat_payload = {
                    "heat_score": computed.get("heat_score", 1),
                    "heat_score_raw": computed.get("heat_score_raw", 1.0),
                    "heat_level": computed.get("heat_level", 1),
                    "heat_label": computed.get("heat_label", "Cold"),
                    "heat_badge": computed.get("heat_badge", "\U0001F9CA"),
                }
                heat_debug = computed_breakdown if debug else None
                mode = None
                if isinstance(computed_breakdown, dict):
                    mode = computed_breakdown.get("mode")
                if heat_source == "netease":
                    if mode == "pop_comment_v2":
                        v2_block = computed_breakdown.get("v2") if isinstance(computed_breakdown, dict) else None
                        if isinstance(v2_block, dict) and "Base" in v2_block and "Bonus" in v2_block:
                            heat_source = "v4-popcomment"
                        else:
                            heat_source = "pop_comment_v2"
                    else:
                        heat_source = "full_metrics"
        except Exception as exc:
            logger.warning("heat_score compute failed: %s", exc)
            ncm_status = "detail_failed"
            detail_cache_hit = False
            detail_cache_ttl_left = None
    else:
        used_fallback_api, http_error_code, error_message, circuit_open, last_failed = (
            _netease_meta(netease_client)
        )
        if netease_low_confidence is not None:
            ncm_status = "low_confidence"
            error_message = f"low_confidence:{netease_low_confidence:.3f}"
        else:
            ncm_status = "circuit_open" if circuit_open else "search_failed"
        # online-only: no local estimation

    evidence = Evidence(
        used_tags=used_tags,
        used_filename=used_filename,
        queries=queries,
        top_candidates=top_candidates,
        cached=detail_cache_hit,
        cache_hit=detail_cache_hit,
        cache_ttl_left=detail_cache_ttl_left,
        remix_replaced=remix_replaced_flag,
        remix_to_original_swapped=remix_replaced_flag,
        version_tokens=clean_result.version_tokens,
        stripped_dj_tags=clean_result.stripped_dj_tags,
        insufficient_title_metadata=insufficient_title_metadata,
        decision_escalated_to_review=decision_escalated_to_review,
        decision_escalation_reason=decision_escalation_reason,
        dj_edit_mode=dj_edit_mode,
        duration_mode=duration_mode,
        base_text_score_best=base_text_score_best,
        popularity_best=popularity_best,
        popularity_bonus_value=popularity_bonus_value,
        popularity_bonus_applied=popularity_bonus_applied,
        decision_rule=decision_rules,
        duration_delta_best=duration_delta_best,
        duration_override_applied=duration_override_applied,
        netease_source=netease_source,
        netease_base_url=netease_base_url,
        ncm_status=ncm_status,
        used_fallback_api=used_fallback_api,
        http_error_code=http_error_code,
        error_message=error_message,
        heat_source=heat_source,
        file_fingerprint=file_fingerprint,
    )

    if _is_online_heat_required():
        online_ok = heat_source in {"full_metrics", "pop_comment_v2", "v4-popcomment"} and ncm_status == "ok"
        if not online_ok:
            raise _build_online_error(
                ncm_status=ncm_status,
                http_error_code=http_error_code,
                error_message=error_message,
                base_url=netease_base_url,
            )

    response = IdentifyResponse(
        master_track=master_track,
        platform_matches=platform_matches,
        evidence=evidence,
        query=query_payload,
        match=match_payload,
        heat=heat_payload,
        heat_debug=heat_debug,
    )

    store.upsert_master(
        {
            "master_track_id": master_track_id,
            "clean_title": clean_result.clean_title,
            "clean_artist": clean_result.clean_artist,
            "query_title": clean_result.query_title,
            "query_artist": clean_result.query_artist,
            "duration_ms": duration_ms,
        }
    )

    if not debug:
        store.set_cache(f"file:{file_sig}", response.dict())
        store.set_cache(f"query:{query_sig}", response.dict())

    return response


def save_upload_to_temp(file_bytes: bytes, filename: str) -> str:
    tmp_dir = tempfile.mkdtemp(prefix="identify_")
    path = os.path.join(tmp_dir, filename)
    with open(path, "wb") as handle:
        handle.write(file_bytes)
    return path
