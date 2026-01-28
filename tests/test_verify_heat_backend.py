import pytest

def test_verify_heat_backend_cli_defaults():
    import scripts.verify_heat_backend as vb
    args = vb.parse_args([])
    assert args.base_url
    assert args.db_path
    assert args.timeout



def test_clear_cache_executes_delete(tmp_path):
    import sqlite3
    import scripts.verify_heat_backend as vb

    db_path = tmp_path / "data.db"
    conn = sqlite3.connect(db_path)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS cache (cache_key TEXT PRIMARY KEY, value_json TEXT)"
    )
    conn.execute("INSERT INTO cache(cache_key, value_json) VALUES (?, ?)", ("k1", "{}"))
    conn.commit()
    conn.close()

    ok, _ = vb.clear_cache(str(db_path))
    assert ok is True

    conn = sqlite3.connect(db_path)
    cur = conn.execute("SELECT COUNT(*) FROM cache")
    count = cur.fetchone()[0]
    conn.close()
    assert count == 0


def test_run_verify_ok(monkeypatch, tmp_path):
    import scripts.verify_heat_backend as vb

    audio = tmp_path / "sample.wav"
    audio.write_bytes(b"dummy")

    monkeypatch.setattr(vb, "restart_backend", lambda *_: True)
    monkeypatch.setattr(vb, "clear_cache", lambda *_: (True, "ok"))

    class DummyResp:
        status_code = 200

        def json(self):
            return {"evidence": {"heat_source": "v4-popcomment"}}

    monkeypatch.setattr(vb.requests, "post", lambda *_, **__: DummyResp())

    rc = vb.run_verify(
        base_url="http://127.0.0.1:8002",
        db_path=str(tmp_path / "data.db"),
        audio_file=str(audio),
        timeout=5.0,
        strict=True,
    )
    assert rc == 0



def test_check_heat_source_connection_error(monkeypatch, tmp_path):
    import requests
    import scripts.verify_heat_backend as vb

    audio = tmp_path / "sample.wav"
    audio.write_bytes(b"dummy")

    def _raise(*_, **__):
        raise requests.ConnectionError("boom")

    monkeypatch.setattr(vb.requests, "post", _raise)

    ok, reason = vb.check_heat_source(
        base_url="http://127.0.0.1:8002",
        audio_file=str(audio),
        timeout=1.0,
    )
    assert ok is False
    assert "connection_failed" in reason



def test_wait_for_port_false():
    import scripts.verify_heat_backend as vb

    ok = vb.wait_for_port("127.0.0.1", 65530, timeout_s=0.2, interval=0.05)
    assert ok is False



def test_check_heat_source_503_detail(monkeypatch, tmp_path):
    import scripts.verify_heat_backend as vb

    audio = tmp_path / "sample.wav"
    audio.write_bytes(b"dummy")

    class DummyResp:
        status_code = 503

        def json(self):
            return {"detail": {"message": "online_heat_required: ncm_status=search_failed"}}

    monkeypatch.setattr(vb.requests, "post", lambda *_, **__: DummyResp())

    ok, reason = vb.check_heat_source(
        base_url="http://127.0.0.1:8002",
        audio_file=str(audio),
        timeout=1.0,
    )
    assert ok is False
    assert "online_heat_required" in reason



def test_env_audio_override(monkeypatch, tmp_path):
    import scripts.verify_heat_backend as vb

    audio = tmp_path / "override.wav"
    audio.write_bytes(b"dummy")

    captured = {}

    def _run_verify(**kwargs):
        captured.update(kwargs)
        return 0

    monkeypatch.setenv("HEAT_VERIFY_AUDIO", str(audio))
    monkeypatch.setattr(vb, "run_verify", _run_verify)

    rc = vb.main([])
    assert rc == 0
    assert captured.get("audio_file") == str(audio)
