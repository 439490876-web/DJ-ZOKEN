from __future__ import annotations

import json
import os
import sqlite3
from datetime import datetime
from typing import Any, Dict, Optional


def _utc_now() -> str:
    return datetime.utcnow().isoformat(timespec="seconds") + "Z"


class SQLiteStore:
    def __init__(self, db_path: Optional[str] = None) -> None:
        path = db_path or os.getenv("APP_DB_PATH") or os.path.join(
            os.path.dirname(__file__), "..", "data.db"
        )
        self.db_path = os.path.abspath(path)
        self.conn = sqlite3.connect(self.db_path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self._init_schema()

    def _init_schema(self) -> None:
        with self.conn:
            self.conn.execute(
                """
                CREATE TABLE IF NOT EXISTS master_tracks (
                    master_track_id TEXT PRIMARY KEY,
                    clean_title TEXT,
                    clean_artist TEXT,
                    query_title TEXT,
                    query_artist TEXT,
                    duration_ms INTEGER,
                    created_at TEXT
                )
                """
            )
            self.conn.execute(
                """
                CREATE TABLE IF NOT EXISTS platform_tracks (
                    platform TEXT,
                    platform_track_id TEXT,
                    title TEXT,
                    artist TEXT,
                    duration_ms INTEGER,
                    popularity REAL,
                    raw_json TEXT,
                    PRIMARY KEY(platform, platform_track_id)
                )
                """
            )
            self.conn.execute(
                """
                CREATE TABLE IF NOT EXISTS mappings (
                    master_track_id TEXT,
                    platform TEXT,
                    platform_track_id TEXT,
                    match_score REAL,
                    confidence REAL,
                    decision TEXT,
                    created_at TEXT,
                    PRIMARY KEY(master_track_id, platform)
                )
                """
            )
            self.conn.execute(
                """
                CREATE TABLE IF NOT EXISTS cache (
                    cache_key TEXT PRIMARY KEY,
                    value_json TEXT,
                    updated_at TEXT
                )
                """
            )

    def get_cache(self, cache_key: str) -> Optional[Dict[str, Any]]:
        cur = self.conn.execute("SELECT value_json FROM cache WHERE cache_key = ?", (cache_key,))
        row = cur.fetchone()
        if not row:
            return None
        return json.loads(row["value_json"])

    def set_cache(self, cache_key: str, value: Dict[str, Any]) -> None:
        payload = json.dumps(value, ensure_ascii=False)
        with self.conn:
            self.conn.execute(
                """
                INSERT INTO cache(cache_key, value_json, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(cache_key) DO UPDATE SET
                    value_json = excluded.value_json,
                    updated_at = excluded.updated_at
                """,
                (cache_key, payload, _utc_now()),
            )

    def upsert_master(self, data: Dict[str, Any]) -> None:
        with self.conn:
            self.conn.execute(
                """
                INSERT INTO master_tracks(
                    master_track_id, clean_title, clean_artist,
                    query_title, query_artist, duration_ms, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(master_track_id) DO NOTHING
                """,
                (
                    data["master_track_id"],
                    data["clean_title"],
                    data["clean_artist"],
                    data["query_title"],
                    data["query_artist"],
                    data.get("duration_ms"),
                    _utc_now(),
                ),
            )

    def upsert_platform_track(self, platform: str, data: Dict[str, Any]) -> None:
        with self.conn:
            self.conn.execute(
                """
                INSERT INTO platform_tracks(
                    platform, platform_track_id, title, artist,
                    duration_ms, popularity, raw_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(platform, platform_track_id) DO UPDATE SET
                    title = excluded.title,
                    artist = excluded.artist,
                    duration_ms = excluded.duration_ms,
                    popularity = excluded.popularity,
                    raw_json = excluded.raw_json
                """,
                (
                    platform,
                    data["track_id"],
                    data["title"],
                    data["artist"],
                    data.get("duration_ms"),
                    data.get("popularity"),
                    json.dumps(data.get("extra") or {}, ensure_ascii=False),
                ),
            )

    def upsert_mapping(
        self,
        master_track_id: str,
        platform: str,
        platform_track_id: Optional[str],
        match_score: float,
        confidence: float,
        decision: str,
    ) -> None:
        with self.conn:
            self.conn.execute(
                """
                INSERT INTO mappings(
                    master_track_id, platform, platform_track_id,
                    match_score, confidence, decision, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(master_track_id, platform) DO UPDATE SET
                    platform_track_id = excluded.platform_track_id,
                    match_score = excluded.match_score,
                    confidence = excluded.confidence,
                    decision = excluded.decision,
                    created_at = excluded.created_at
                """,
                (
                    master_track_id,
                    platform,
                    platform_track_id,
                    match_score,
                    confidence,
                    decision,
                    _utc_now(),
                ),
            )

    def get_master_bundle(self, master_track_id: str) -> Optional[Dict[str, Any]]:
        cur = self.conn.execute(
            "SELECT * FROM master_tracks WHERE master_track_id = ?",
            (master_track_id,),
        )
        master = cur.fetchone()
        if not master:
            return None

        cur = self.conn.execute(
            "SELECT * FROM mappings WHERE master_track_id = ?",
            (master_track_id,),
        )
        mappings = [dict(row) for row in cur.fetchall()]
        platform_matches: Dict[str, Optional[Dict[str, Any]]] = {}
        for mapping in mappings:
            platform = mapping["platform"]
            track_id = mapping["platform_track_id"]
            if not track_id:
                platform_matches[platform] = None
                continue
            tcur = self.conn.execute(
                """
                SELECT * FROM platform_tracks
                WHERE platform = ? AND platform_track_id = ?
                """,
                (platform, track_id),
            )
            row = tcur.fetchone()
            platform_matches[platform] = dict(row) if row else None

        return {
            "master_track": dict(master),
            "platform_matches": platform_matches,
            "mappings": mappings,
        }
