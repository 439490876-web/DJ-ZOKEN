import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.clients.base import Candidate
from app.db.sqlite import SQLiteStore
from app.services import identify as identify_service


class FakeNeteaseClient:
    platform = "netease"

    def __init__(
        self,
        candidates=None,
        detail=None,
        error_code=None,
        error_message=None,
        circuit_open=False,
        last_failed=True,
        used_fallback=False,
    ):
        self.base_url = "http://mock-api"
        self._candidates = candidates or []
        self._detail = detail
        self.last_error_code = error_code
        self.last_error_message = error_message
        self.circuit_open = circuit_open
        self.last_request_failed = last_failed
        self.used_fallback_base_url = used_fallback

    def search_tracks(self, query: str, limit: int = 20):
        return self._candidates

    def fetch_track_detail(self, track_id: str):
        return self._detail


def _prepare_file(tmp_path: Path) -> Path:
    file_path = tmp_path / "Artist - Song (Remix).mp3"
    file_path.write_bytes(b"fake-audio")
    return file_path


def _prepare_env(monkeypatch, client: FakeNeteaseClient):
    monkeypatch.setattr(
        identify_service, "_build_clients", lambda: ([client], "enhanced_api", client.base_url)
    )
    monkeypatch.setattr(identify_service, "_read_tags", lambda *_: (None, None, None))
    monkeypatch.setattr(identify_service, "get_duration_ms", lambda *_: None)


def test_search_failure_returns_local_estimated_heat(tmp_path, monkeypatch):
    client = FakeNeteaseClient(error_code=502, error_message="bad_gateway_502", last_failed=True)
    _prepare_env(monkeypatch, client)
    store = SQLiteStore(db_path=str(tmp_path / "test.db"))
    file_path = _prepare_file(tmp_path)
    with pytest.raises(identify_service.OnlineHeatRequiredError) as excinfo:
        identify_service.identify_file(str(file_path), file_path.name, store, debug=False)
    assert excinfo.value.reason == "search_failed"
    assert excinfo.value.ncm_status == "search_failed"
    assert excinfo.value.http_error_code == 502


def test_detail_failure_still_returns_match_and_local_heat(tmp_path, monkeypatch):
    candidate = Candidate(track_id="123", title="Song", artist="Artist", duration_ms=None, popularity=0.3)
    client = FakeNeteaseClient(
        candidates=[candidate],
        detail=None,
        error_code=504,
        error_message="gateway_timeout",
        last_failed=True,
    )
    _prepare_env(monkeypatch, client)
    store = SQLiteStore(db_path=str(tmp_path / "test.db"))
    file_path = _prepare_file(tmp_path)
    with pytest.raises(identify_service.OnlineHeatRequiredError) as excinfo:
        identify_service.identify_file(str(file_path), file_path.name, store, debug=False)
    assert excinfo.value.reason == "detail_failed"
    assert excinfo.value.ncm_status == "detail_failed"


def test_circuit_open_fast_fallback(tmp_path, monkeypatch):
    client = FakeNeteaseClient(
        candidates=[],
        detail=None,
        error_code=None,
        error_message="circuit_open",
        circuit_open=True,
        last_failed=True,
    )
    _prepare_env(monkeypatch, client)
    store = SQLiteStore(db_path=str(tmp_path / "test.db"))
    file_path = _prepare_file(tmp_path)
    with pytest.raises(identify_service.OnlineHeatRequiredError) as excinfo:
        identify_service.identify_file(str(file_path), file_path.name, store, debug=False)
    assert excinfo.value.reason == "circuit_open"
    assert excinfo.value.ncm_status == "circuit_open"
