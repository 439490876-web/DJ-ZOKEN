from __future__ import annotations

import json
import logging
import os
import time
from typing import Dict, List, Optional, Tuple

import requests

from .base import BaseClient, Candidate

logger = logging.getLogger(__name__)


def _debug_enabled() -> bool:
    return os.getenv("NCM_DEBUG", "").strip().lower() in {"1", "true", "yes", "on"}


def _debug_log(message: str, **fields: object) -> None:
    if not _debug_enabled():
        return
    details = " ".join(f"{key}={value}" for key, value in fields.items())
    logger.debug("%s %s", message, details)

DEFAULT_NETEASE_BASE_URL = "http://127.0.0.1:3001"
RETRY_BACKOFF_SEC = [0.2, 0.6, 1.2]
RETRYABLE_STATUS = {502, 503, 504}

_CIRCUIT_STATE: Dict[str, Dict[str, object]] = {}


def _get_circuit_state(base_url: str) -> Dict[str, object]:
    state = _CIRCUIT_STATE.get(base_url)
    if not state:
        state = {"failures": 0, "open_until": 0.0, "half_open": False}
        _CIRCUIT_STATE[base_url] = state
    return state


def _circuit_is_open(state: Dict[str, object]) -> bool:
    open_until = float(state.get("open_until") or 0.0)
    if open_until and time.time() < open_until:
        return True
    if open_until and time.time() >= open_until:
        state["open_until"] = 0.0
        state["half_open"] = True
    return False


def _record_success(state: Dict[str, object]) -> None:
    state["failures"] = 0
    state["open_until"] = 0.0
    state["half_open"] = False


def _record_failure(state: Dict[str, object]) -> None:
    failures = int(state.get("failures") or 0) + 1
    state["failures"] = failures
    half_open = bool(state.get("half_open"))
    if half_open or failures >= 5:
        state["open_until"] = time.time() + 30.0
        state["half_open"] = False


def _request_json_base(
    base_url: str,
    path: str,
    params: Dict[str, str],
    retries: int,
    backoff: List[float],
    headers: Optional[Dict[str, str]] = None,
    timeout: Tuple[float, float] = (3, 6),
) -> Tuple[Optional[Dict], Dict[str, object]]:
    state = _get_circuit_state(base_url)
    if _circuit_is_open(state):
        return None, {
            "circuit_open": True,
            "http_error_code": None,
            "error_message": "circuit_open",
            "status_code": None,
            "response_length": None,
        }
    url = f"{base_url}{path}"
    last_error_message = None
    last_error_code = None
    for attempt in range(retries):
        try:
            resp = requests.get(url, params=params, timeout=timeout, headers=headers)
        except requests.RequestException as exc:
            last_error_message = f"{exc.__class__.__name__}: {exc}"
            last_error_code = None
            if attempt < retries - 1:
                time.sleep(backoff[min(attempt, len(backoff) - 1)])
                continue
            _record_failure(state)
            return None, {
                "circuit_open": False,
                "http_error_code": last_error_code,
                "error_message": last_error_message,
                "status_code": None,
                "response_length": None,
            }
        if resp.status_code in RETRYABLE_STATUS:
            last_error_message = f"bad_gateway_{resp.status_code}"
            last_error_code = resp.status_code
            if attempt < retries - 1:
                time.sleep(backoff[min(attempt, len(backoff) - 1)])
                continue
            _record_failure(state)
            return None, {
                "circuit_open": False,
                "http_error_code": last_error_code,
                "error_message": last_error_message,
                "status_code": resp.status_code,
                "response_length": len(resp.text or ""),
            }
        if resp.status_code != 200:
            return None, {
                "circuit_open": False,
                "http_error_code": resp.status_code,
                "error_message": f"http_{resp.status_code}",
                "status_code": resp.status_code,
                "response_length": len(resp.text or ""),
            }
        try:
            payload = resp.json()
        except ValueError:
            _record_failure(state)
            return None, {
                "circuit_open": False,
                "http_error_code": resp.status_code,
                "error_message": "invalid_json",
                "status_code": resp.status_code,
                "response_length": len(resp.text or ""),
            }
        _record_success(state)
        return payload, {
            "circuit_open": False,
            "http_error_code": None,
            "error_message": None,
            "status_code": resp.status_code,
            "response_length": len(resp.text or ""),
        }
    _record_failure(state)
    return None, {
        "circuit_open": False,
        "http_error_code": last_error_code,
        "error_message": last_error_message,
        "status_code": None,
        "response_length": None,
    }


def request_json(
    base_url: str,
    path: str,
    params: Dict[str, str],
    fallback_url: Optional[str] = None,
    headers: Optional[Dict[str, str]] = None,
    timeout: Tuple[float, float] = (3, 6),
    retries: int = 3,
    backoff: Optional[List[float]] = None,
) -> Tuple[Optional[Dict], Dict[str, object]]:
    if backoff is None:
        backoff = RETRY_BACKOFF_SEC
    payload, meta = _request_json_base(base_url, path, params, retries, backoff, headers, timeout)
    meta["used_fallback_base_url"] = False
    if payload is not None:
        return payload, meta
    if fallback_url:
        fallback_payload, fallback_meta = _request_json_base(
            fallback_url,
            path,
            params,
            1,
            [0.2],
            headers,
            timeout,
        )
        fallback_meta["used_fallback_base_url"] = True
        return fallback_payload, fallback_meta
    return payload, meta


class NeteaseEnhancedClient(BaseClient):
    platform = "netease"

    def __init__(self) -> None:
        base_url = os.getenv("NETEASE_API_BASE_URL", DEFAULT_NETEASE_BASE_URL)
        self.base_url = base_url.rstrip("/")
        self.real_ip = os.getenv("NETEASE_REAL_IP")
        self.force_cloudsearch = os.getenv("NETEASE_FORCE_CLOUDSEARCH", "1").strip().lower() in {"1", "true", "yes", "on"}
        fallback = os.getenv("NETEASE_API_FALLBACK_URL")
        self.fallback_url = fallback.rstrip("/") if fallback else None
        self._search_endpoint: Optional[str] = None
        self._detail_endpoint: Optional[str] = None
        self._detail_mode: str = "comma"
        self.last_error_code: Optional[int] = None
        self.last_error_message: Optional[str] = None
        self.last_request_failed: bool = False
        self.used_fallback_base_url: bool = False
        self.circuit_open: bool = False

    def search_tracks(self, query: str, limit: int = 20) -> List[Candidate]:
        params = {"keywords": query, "type": 1, "limit": limit}
        if self.real_ip:
            params["realIP"] = self.real_ip
        suggest_params = {"keywords": query}
        if self.real_ip:
            suggest_params["realIP"] = self.real_ip

        if self.force_cloudsearch:
            endpoints = [
                ("/cloudsearch", params),
                ("/search", params),
                ("/search/suggest", suggest_params),
            ]
        else:
            endpoints = [
                ("/search", params),
                ("/cloudsearch", params),
                ("/search/suggest", suggest_params),
            ]

        if self._search_endpoint:
            endpoints = [
                (self._search_endpoint, {"keywords": query, "type": 1, "limit": limit})
            ]

        last_error: Optional[str] = None
        for path, params in endpoints:
            url = f"{self.base_url}{path}"
            response = self._get(path, params)
            if not response:
                last_error = f"{url} failed"
                continue
            songs = extract_songs(response)
            if songs is None:
                last_error = f"{url} no_songs"
                continue
            if not self._search_endpoint:
                self._search_endpoint = path
                logger.info("netease search endpoint selected: %s", path)
            candidates = [song_to_candidate(song) for song in songs]
            self._enrich_durations(candidates)
            return candidates[:limit]

        if last_error:
            logger.warning("netease search failed: %s", last_error)
        logger.warning(
            "netease search endpoints failed. Check %s/docs or %s/",
            self.base_url,
            self.base_url,
        )
        return []

    def _get_with_meta(
        self,
        path: str,
        params: Dict[str, str],
        headers: Optional[Dict[str, str]] = None,
        timeout: Tuple[float, float] = (3, 6),
        retries: int = 3,
        backoff: Optional[List[float]] = None,
    ) -> Tuple[Optional[Dict], Dict[str, object]]:
        payload, meta = request_json(
            self.base_url,
            path,
            params,
            self.fallback_url,
            headers=headers,
            timeout=timeout,
            retries=retries,
            backoff=backoff,
        )
        self.used_fallback_base_url = bool(meta.get("used_fallback_base_url"))
        self.circuit_open = bool(meta.get("circuit_open"))
        self.last_error_code = meta.get("http_error_code")
        self.last_error_message = meta.get("error_message")
        self.last_request_failed = payload is None
        return payload, meta

    def _get(self, path: str, params: Dict[str, str]) -> Optional[Dict]:
        payload, meta = self._get_with_meta(path, params)
        if payload is None:
            if self.circuit_open:
                logger.warning("netease circuit open for %s", self.base_url)
                return None
            url = f"{self.base_url}{path}"
            if self.last_error_code:
                logger.warning("netease status=%s url=%s", self.last_error_code, url)
            elif self.last_error_message:
                logger.warning("netease request error: %s", self.last_error_message)
            return None
        self.last_error_code = None
        self.last_error_message = None
        self.last_request_failed = False
        self.circuit_open = False
        return payload

    def _enrich_durations(self, candidates: List[Candidate]) -> None:
        missing = [c for c in candidates if not c.duration_ms]
        if not missing:
            return
        top_ids = [c.track_id for c in missing[:5]]
        songs = self._fetch_detail(top_ids)
        if not songs:
            return
        duration_map = {}
        for song in songs:
            track_id = str(song.get("id"))
            duration = song.get("dt") or song.get("duration") or song.get("duration_ms")
            if duration:
                duration_map[track_id] = int(duration)
        updated = 0
        for candidate in candidates:
            if candidate.track_id in duration_map:
                candidate.duration_ms = duration_map[candidate.track_id]
                updated += 1
        if updated:
            logger.info("netease detail enriched durations: %s", updated)

    def _fetch_detail(self, ids: List[str]) -> List[Dict]:
        if not ids:
            return []

        if self._detail_endpoint:
            return self._request_detail(self._detail_endpoint, ids, mode=self._detail_mode)

        attempts = [
            ("/song/detail", "comma"),
            ("/song/detail", "json"),
            ("/song/detail", "single"),
        ]
        for path, mode in attempts:
            songs = self._request_detail(path, ids, mode=mode)
            if songs is None:
                continue
            self._detail_endpoint = path
            self._detail_mode = mode
            logger.info("netease detail endpoint selected: %s (%s)", path, mode)
            return songs
        logger.warning(
            "netease detail endpoints failed. Check %s/docs or %s/",
            self.base_url,
            self.base_url,
        )
        return []

    def _fetch_comment_count(self, track_id: str) -> Optional[int]:
        response = self._get("/comment/music", {"id": track_id, "limit": "1"})
        if not response:
            return None
        total = response.get("total")
        try:
            return int(total)
        except (TypeError, ValueError):
            return None

    def fetch_track_detail(self, track_id: str) -> Optional[Dict]:
        result = self.fetch_track_detail_with_meta(track_id)
        if result.get("ok"):
            return result.get("detail")
        return None


    def _build_detail_headers(self) -> Dict[str, str]:
        headers = {
            "User-Agent": os.getenv(
                "NCM_USER_AGENT",
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
            ),
            "Referer": os.getenv("NCM_REFERER", "https://music.163.com/"),
            "Accept": "application/json",
        }
        cookie = os.getenv("NCM_COOKIE")
        if cookie:
            headers["Cookie"] = cookie
        return headers

    def _request_detail_with_meta(
        self, path: str, ids: List[str], mode: str = "comma"
    ) -> Tuple[Optional[List[Dict]], Dict[str, object]]:
        params: Dict[str, str]
        if mode == "json":
            params = {"ids": json.dumps(ids)}
        elif mode == "single":
            params = {"ids": ids[0]}
        else:
            params = {"ids": ",".join(ids)}
        headers = self._build_detail_headers()
        payload, meta = self._get_with_meta(
            path,
            params,
            headers=headers,
            timeout=(10, 10),
            retries=2,
            backoff=[0.3, 0.8],
        )
        meta.update({"path": path, "mode": mode, "params": params})
        if payload is None:
            meta["songs_count"] = 0
            return None, meta
        songs = extract_songs(payload)
        if songs is None:
            meta["songs_count"] = 0
            meta["error_class"] = "parse_error"
            return None, meta
        meta["songs_count"] = len(songs)
        return songs, meta

    def fetch_track_detail_with_meta(self, track_id: str) -> Dict[str, object]:
        track_id_str = str(track_id)
        if not track_id_str.isdigit():
            return {
                "ok": False,
                "track_id": track_id_str,
                "detail": None,
                "error_reason": "invalid_track_id_format",
                "error_reason_chain": "invalid_track_id_format",
                "raw_source": None,
            }
        errors: List[str] = []
        attempts: List[Tuple[str, str, str]] = []
        if self._detail_endpoint:
            attempts.append((self._detail_endpoint, self._detail_mode, "detail_cached"))
        attempts.extend(
            [
                ("/song/detail", "comma", "detail_primary"),
                ("/song/detail", "json", "detail_json"),
                ("/song/detail", "single", "detail_single"),
            ]
        )
        for path, mode, source_label in attempts:
            songs, meta = self._request_detail_with_meta(path, [track_id_str], mode=mode)
            error_reason = None
            if meta.get("circuit_open"):
                error_reason = "api_unreachable"
            elif meta.get("http_error_code"):
                error_reason = f"http_{meta.get('http_error_code')}"
            elif meta.get("error_message"):
                if meta.get("error_message") == "invalid_json":
                    error_reason = "parse_error"
                else:
                    error_reason = str(meta.get("error_message"))
            elif not songs:
                error_reason = "empty_json"

            _debug_log(
                "netease_detail_attempt",
                track_id=track_id_str,
                endpoint=meta.get("path"),
                params=meta.get("params"),
                status_code=meta.get("status_code"),
                response_length=meta.get("response_length"),
                songs_count=meta.get("songs_count"),
                error_reason=error_reason,
            )

            if songs:
                from app.services.scoring import normalize_netease_metrics
                song = songs[0]
                if not self._detail_endpoint:
                    self._detail_endpoint = path
                    self._detail_mode = mode
                if isinstance(song, dict) and "comment_count" not in song and "commentCount" not in song:
                    comment_count = self._fetch_comment_count(track_id_str)
                    if comment_count is not None:
                        song["comment_count"] = comment_count
                metrics = normalize_netease_metrics(song)
                popularity_source = "missing"
                if "popularity" in song:
                    popularity_source = "popularity"
                elif "pop" in song:
                    popularity_source = "pop"
                elif "score" in song:
                    popularity_source = "score"
                elif "playCount" in song:
                    popularity_source = "playCount"
                elif "play_count" in song:
                    popularity_source = "play_count"

                popularity = metrics.get("_popularity")
                if popularity_source in {"score", "playCount", "play_count"}:
                    try:
                        popularity = float(song.get(popularity_source) or 0.0)
                    except (TypeError, ValueError):
                        popularity = None

                comment_source = "missing"
                if "comment_count" in song or "commentCount" in song:
                    comment_source = "comment_count"
                elif isinstance(song, dict) and song.get("comment_count") is not None:
                    comment_source = "comment_api"

                publish_time_source = "missing"
                if any(key in song for key in ["publishTime", "publish_time", "publishTimestamp", "releaseTime"]):
                    publish_time_source = "publish_time"

                return {
                    "ok": True,
                    "track_id": track_id_str,
                    "detail": song,
                    "error_reason": None,
                    "error_reason_chain": " -> ".join(errors) if errors else None,
                    "raw_source": f"{source_label}:{path}:{mode}",
                    "popularity": popularity,
                    "comment_count": metrics.get("comment_count"),
                    "publish_time": metrics.get("publish_time"),
                    "popularity_source": popularity_source,
                    "comment_source": comment_source,
                    "publish_time_source": publish_time_source,
                }

            if error_reason:
                errors.append(error_reason)

        final_reason = errors[-1] if errors else "netease_detail_empty"
        return {
            "ok": False,
            "track_id": track_id_str,
            "detail": None,
            "error_reason": final_reason,
            "error_reason_chain": " -> ".join(errors) if errors else final_reason,
            "raw_source": None,
        }

    def _request_detail(
        self, path: str, ids: List[str], mode: str = "comma"
    ) -> Optional[List[Dict]]:
        params: Dict[str, str]
        if mode == "json":
            params = {"ids": json.dumps(ids)}
        elif mode == "single":
            params = {"ids": ids[0]}
        else:
            params = {"ids": ",".join(ids)}
        response = self._get(path, params)
        if not response:
            return None
        songs = extract_songs(response)
        if songs is None:
            return None
        return songs


def extract_songs(payload: Dict) -> Optional[List[Dict]]:
    if not isinstance(payload, dict):
        return None
    if "result" in payload and isinstance(payload["result"], dict):
        result = payload["result"]
        songs = result.get("songs")
        if isinstance(songs, list):
            return songs
    if "data" in payload and isinstance(payload["data"], dict):
        songs = payload["data"].get("songs")
        if isinstance(songs, list):
            return songs
    songs = payload.get("songs")
    if isinstance(songs, list):
        return songs
    return None


def song_to_candidate(song: Dict) -> Candidate:
    track_id = str(song.get("id") or "")
    title = song.get("name") or song.get("title") or ""

    artist = ""
    if isinstance(song.get("artists"), list):
        artist = "/".join(a.get("name", "") for a in song.get("artists") if isinstance(a, dict))
    elif isinstance(song.get("ar"), list):
        artist = "/".join(a.get("name", "") for a in song.get("ar") if isinstance(a, dict))
    else:
        artist = song.get("artist") or song.get("artistsName") or ""

    duration = song.get("duration") or song.get("dt") or song.get("duration_ms")
    duration_ms = int(duration) if duration else None

    popularity_raw = song.get("popularity") or song.get("pop") or 0
    try:
        popularity = float(popularity_raw) / 100.0
    except (TypeError, ValueError):
        popularity = 0.0

    return Candidate(
        track_id=track_id,
        title=title,
        artist=artist,
        duration_ms=duration_ms,
        popularity=popularity,
        extra=song,
    )
