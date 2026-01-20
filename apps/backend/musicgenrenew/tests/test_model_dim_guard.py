import json

import numpy as np
import pytest

from .conftest import build_settings
from app.model import infer as infer_module


def _write_labels_json(path, count=400):
    path.write_text(
        json.dumps(
            {
                "name": "EffnetDiscogs",
                "version": "1",
                "classes": [f"Genre---Style{i}" for i in range(count)],
                "schema": {"inputs": [{"shape": ["n", 128, 96]}]},
                "inference": {"sample_rate": 16000},
            }
        )
    )


def test_backbone_dim_mismatch_without_head(monkeypatch, tmp_path):
    onnx_path = tmp_path / "discogs-effnet-bsdynamic-1.onnx"
    json_path = tmp_path / "discogs-effnet-bsdynamic-1.json"
    onnx_path.write_bytes(b"fake-onnx")
    _write_labels_json(json_path)

    def fake_ensure_model_files(_settings):
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
        def __init__(self, *_args, **_kwargs):
            self._inputs = [type("I", (), {"name": "input", "shape": [None, 128, 96]})()]
            self._outputs = [type("O", (), {"name": "out", "shape": [None, 128]})()]

        def get_inputs(self):
            return self._inputs

        def get_outputs(self):
            return self._outputs

        def run(self, *_args, **_kwargs):
            return [np.zeros((1, 128), dtype=np.float32)]

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
        model_head_onnx="",
        model_head_json="",
        model_head_url_base="http://example/head",
        enable_classification_head="auto",
        head_expected_dim=400,
        request_timeout_sec=5.0,
        preload_model=False,
    )

    service = infer_module.ModelService(settings)
    with pytest.raises(RuntimeError, match="classification head required"):
        service.load()


def test_head_output_dim_mismatch(monkeypatch, tmp_path):
    onnx_path = tmp_path / "discogs-effnet-bsdynamic-1.onnx"
    json_path = tmp_path / "discogs-effnet-bsdynamic-1.json"
    head_onnx_path = tmp_path / "genre_discogs400.onnx"
    head_json_path = tmp_path / "genre_discogs400.json"
    onnx_path.write_bytes(b"fake-onnx")
    head_onnx_path.write_bytes(b"fake-head")
    _write_labels_json(json_path)
    head_json_path.write_text("{\"name\": \"Head\"}")

    def fake_ensure_model_files(_settings):
        return onnx_path, json_path, "local"

    def fake_ensure_head_files(_settings):
        return head_onnx_path, head_json_path, "local"

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
        def __init__(self, path, *_args, **_kwargs):
            self._inputs = [type("I", (), {"name": "input", "shape": [None, 128, 96]})()]
            if "genre_discogs400" in str(path):
                self._outputs = [type("O", (), {"name": "out", "shape": [None, 300]})()]
            else:
                self._outputs = [type("O", (), {"name": "out", "shape": [None, 128]})()]

        def get_inputs(self):
            return self._inputs

        def get_outputs(self):
            return self._outputs

        def run(self, *_args, **_kwargs):
            dim = self._outputs[0].shape[-1]
            return [np.zeros((1, dim), dtype=np.float32)]

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
    monkeypatch.setattr(infer_module, "ensure_head_files", fake_ensure_head_files)
    monkeypatch.setattr(infer_module, "ort", dummy_ort)

    settings = build_settings(
        model_dir=str(tmp_path),
        model_onnx="discogs-effnet-bsdynamic-1.onnx",
        model_json="discogs-effnet-bsdynamic-1.json",
        model_url_base="http://example",
        model_head_onnx="genre_discogs400.onnx",
        model_head_json="genre_discogs400.json",
        model_head_url_base="http://example/head",
        enable_classification_head="true",
        head_expected_dim=400,
        request_timeout_sec=5.0,
        preload_model=False,
    )

    service = infer_module.ModelService(settings)
    with pytest.raises(RuntimeError, match="head_output_dim"):
        service.load()
