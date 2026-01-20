from fastapi.testclient import TestClient

from app.main import create_app


class DummyService:
    def __init__(self):
        self.is_loaded = True
        self.label_count = 400
        self.output_dim = 400
        self.backbone_output_dim = 400
        self.head_enabled = False
        self.head_output_dim = None

    def model_info(self):
        return {"name": "discogs-effnet", "backend": "onnxruntime", "labels": 400}


def test_health_endpoint():
    app = create_app(
        model_service=DummyService(),
        load_model=False,
        enable_startup_checks=False,
    )
    client = TestClient(app)
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["model_loaded"] is True
    assert data["label_count"] == 400
    assert data["output_dim"] == 400
    assert data["backbone_output_dim"] == 400
    assert data["head_enabled"] is False
    assert data["head_output_dim"] is None
