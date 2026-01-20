from fastapi.testclient import TestClient

from app.main import create_app


class FailingService:
    def __init__(self):
        self.is_loaded = True
        self.label_count = 400
        self.output_dim = None
        self.backbone_output_dim = None
        self.head_enabled = None
        self.head_output_dim = None

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
        raise RuntimeError("boom")


def test_predict_error_response():
    app = create_app(
        model_service=FailingService(),
        load_model=False,
        enable_startup_checks=False,
    )
    client = TestClient(app)
    resp = client.post(
        "/predict",
        files={"file": ("bad.mp3", b"fake-audio", "audio/mpeg")},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["error"]["code"] == "ANALYSIS_FAILED"
    assert data["top_styles"] == []
    assert data["filename_display"] == "bad.mp3"
