import json
from pathlib import Path

from scripts import batch_predict_remixtest as batch


class _FakeResponse:
    def __init__(self, payload):
        self.status_code = 200
        self._payload = payload
        self.text = json.dumps(payload)
        self.request = None

    def json(self):
        return self._payload


class _FakeClient:
    def __init__(self, *args, **kwargs):
        pass

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def post(self, _endpoint, params=None, files=None):
        return _FakeResponse(
            {
                "request_id": "test",
                "duration_sec": 30.0,
                "segment": {
                    "mode": "drop",
                    "start_sec": 5.0,
                    "end_sec": 25.0,
                    "strategy": "energy",
                    "drop_seconds": 20.0,
                },
                "top_styles": [{"style": "House", "prob": 0.9, "genre": "Electronic"}],
                "all_above_threshold": [],
                "model_info": {"name": "discogs-effnet", "backend": "onnxruntime", "labels": 400},
            }
        )


def test_batch_script_smoke(tmp_path, monkeypatch):
    input_dir = tmp_path / "remixtest"
    input_dir.mkdir()
    fake_file = input_dir / "track1.mp3"
    fake_file.write_bytes(b"fake-audio")

    monkeypatch.setattr(batch, "get_duration_ffprobe", lambda _path: None)
    monkeypatch.setattr(batch.httpx, "Client", _FakeClient)

    out_dir = tmp_path / "reports"
    code = batch.main(
        [
            "--input_dir",
            str(input_dir),
            "--endpoint",
            "http://127.0.0.1:8000/predict",
            "--out_dir",
            str(out_dir),
            "--concurrency",
            "1",
        ]
    )
    assert code == 0

    csv_path = out_dir / "remixtest_results.csv"
    jsonl_path = out_dir / "remixtest_results.jsonl"
    summary_path = out_dir / "remixtest_summary.md"

    assert csv_path.exists()
    assert jsonl_path.exists()
    assert summary_path.exists()

    csv_text = csv_path.read_text(encoding="utf-8")
    assert "file_relpath" in csv_text
    assert "top1_style" in csv_text

    jsonl_text = jsonl_path.read_text(encoding="utf-8")
    assert "request_id" in jsonl_text
    assert "segment" in jsonl_text

    summary_text = summary_path.read_text(encoding="utf-8")
    assert "Total files" in summary_text
    assert "Top Styles" in summary_text
