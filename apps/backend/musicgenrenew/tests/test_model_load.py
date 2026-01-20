import json

import numpy as np

from .conftest import build_settings
from app.model import infer as infer_module


def test_model_load_singleton(monkeypatch, tmp_path):
    onnx_path = tmp_path / "discogs-effnet-bsdynamic-1.onnx"
    json_path = tmp_path / "discogs-effnet-bsdynamic-1.json"
    onnx_path.write_bytes(b"fake-onnx")
    json_path.write_text(
        json.dumps(
            {
                "name": "EffnetDiscogs",
                "version": "1",
                "classes": [f"Genre---Style{i}" for i in range(400)],
                "schema": {"inputs": [{"shape": ["n", 128, 96]}]},
                "inference": {"sample_rate": 16000},
            }
        )
    )

    def fake_ensure_model_files(settings):
        return onnx_path, json_path, "local"

    class DummySessionOptions:
        def __init__(self):
            self.intra_op_num_threads = 1
            self.inter_op_num_threads = 1
            self.graph_optimization_level = None

    class DummyGraphOptimizationLevel:
        ORT_ENABLE_ALL = 99
        ORT_ENABLE_BASIC = 1
        ORT_DISABLE_ALL = 0

    class DummySession:
        def __init__(self, *args, **kwargs):
            self._inputs = [type("I", (), {"name": "input", "shape": [None, 128, 96]})()]
            self._outputs = [type("O", (), {"name": "out", "shape": [None, 400]})()]

        def get_inputs(self):
            return self._inputs

        def get_outputs(self):
            return self._outputs

        def run(self, *_args, **_kwargs):
            return [np.zeros((1, 400), dtype=np.float32)]

    dummy_ort = type(
        "DummyOrt",
        (),
        {
            "SessionOptions": DummySessionOptions,
            "GraphOptimizationLevel": DummyGraphOptimizationLevel,
            "InferenceSession": DummySession,
        },
    )()

    monkeypatch.setattr(infer_module, "ensure_model_files", fake_ensure_model_files)
    monkeypatch.setattr(infer_module, "ort", dummy_ort)

    settings = build_settings(
        model_dir=str(tmp_path),
        model_onnx="discogs-effnet-bsdynamic-1.onnx",
        model_json="discogs-effnet-bsdynamic-1.json",
        model_url_base="http://example",
        model_head_onnx="genre_discogs400.onnx",
        model_head_json="genre_discogs400.json",
        model_head_url_base="http://example/head",
        enable_classification_head="auto",
        head_expected_dim=400,
        request_timeout_sec=5.0,
        preload_model=False,
    )

    service = infer_module.ModelService(settings)
    service.load()
    assert service.is_loaded
    assert service.label_count == 400

    service.load()
    assert service.is_loaded
