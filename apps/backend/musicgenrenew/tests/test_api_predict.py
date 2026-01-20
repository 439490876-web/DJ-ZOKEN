from fastapi.testclient import TestClient

from app.main import create_app
from app.model.infer import Prediction


class DummyService:
    def __init__(self):
        self.is_loaded = True
        self.label_count = 400

    def model_info(self):
        return {"name": "discogs-effnet", "backend": "onnxruntime", "labels": 400}

    def predict_from_file(
        self,
        _path,
        _clip_seconds,
        _top_k,
        _threshold,
        _segment_mode,
        _drop_strategy,
        _drop_seconds,
        _drop_candidate_top_n,
    ):
        top = [Prediction(style="StyleA", prob=0.9, genre="GenreA")]
        if _segment_mode == "full":
            segment = {
                "mode": "full",
                "start_sec": 0.0,
                "end_sec": 30.0,
                "strategy": _drop_strategy,
                "drop_seconds": _drop_seconds,
            }
        else:
            segment = {
                "mode": "drop",
                "start_sec": 5.0,
                "end_sec": 25.0,
                "strategy": "energy",
                "drop_seconds": 20.0,
            }
        return top, top, 30.0, segment, None


def test_predict_endpoint_response():
    app = create_app(
        model_service=DummyService(),
        load_model=False,
        enable_startup_checks=False,
    )
    client = TestClient(app)
    resp = client.post(
        "/predict",
        files={"file": ("test.mp3", b"fake-audio", "audio/mpeg")},
        params={"top_k": 10, "threshold": 0.1, "clip_seconds": 30},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "request_id" in data
    assert data["top_styles"]
    assert data["all_above_threshold"]
    assert data["segment"]["mode"] == "drop"
    assert data["segment"]["start_sec"] < data["segment"]["end_sec"]
    assert data["model_info"]["backend"] == "onnxruntime"
    assert data["filename_display"] == "test.mp3"
    assert data["filename_raw"] == "test.mp3"
    assert data["error"] is None


def test_predict_full_segment_mode():
    app = create_app(
        model_service=DummyService(),
        load_model=False,
        enable_startup_checks=False,
    )
    client = TestClient(app)
    resp = client.post(
        "/predict",
        files={"file": ("test.mp3", b"fake-audio", "audio/mpeg")},
        params={"segment_mode": "full"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["segment"]["mode"] == "full"
