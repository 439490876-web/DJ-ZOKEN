import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# Stub requests to avoid dependency requirement in test environment.
if "requests" not in sys.modules:
    class _DummyRequests:  # pragma: no cover - test shim
        class RequestException(Exception):
            pass

        def get(self, *args, **kwargs):
            raise self.RequestException("requests disabled in tests")

    sys.modules["requests"] = _DummyRequests()

from app.clients.netease_enhanced import NeteaseEnhancedClient


def test_invalid_track_id_format():
    client = NeteaseEnhancedClient()
    out = client.fetch_track_detail_with_meta("local-123")
    assert out["ok"] is False
    assert out["error_reason"] == "invalid_track_id_format"


def test_empty_json_error_reason_chain(monkeypatch):
    client = NeteaseEnhancedClient()

    def fake_request_detail_with_meta(path, ids, mode="comma"):
        return [], {
            "path": path,
            "mode": mode,
            "status_code": 200,
            "response_length": 0,
            "songs_count": 0,
        }

    monkeypatch.setattr(client, "_request_detail_with_meta", fake_request_detail_with_meta)
    out = client.fetch_track_detail_with_meta("123")
    assert out["ok"] is False
    assert "empty_json" in (out["error_reason"] or "")
    assert "empty_json" in (out["error_reason_chain"] or "")


def test_fallback_success(monkeypatch):
    client = NeteaseEnhancedClient()

    calls = {"count": 0}

    def fake_request_detail_with_meta(path, ids, mode="comma"):
        calls["count"] += 1
        if calls["count"] == 1:
            return [], {"path": path, "mode": mode, "songs_count": 0}
        return [{"id": ids[0], "pop": 80, "comment_count": 12}], {
            "path": path,
            "mode": mode,
            "songs_count": 1,
        }

    monkeypatch.setattr(client, "_request_detail_with_meta", fake_request_detail_with_meta)
    out = client.fetch_track_detail_with_meta("123")
    assert out["ok"] is True
    assert out["detail"]["id"] == "123"
    assert out["raw_source"].startswith("detail")
