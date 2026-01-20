from pathlib import Path

from .conftest import build_settings
from app.model import downloader as downloader_module


def test_downloader_skips_when_local_exists(tmp_path, monkeypatch):
    onnx_path = tmp_path / "discogs-effnet-bsdynamic-1.onnx"
    json_path = tmp_path / "discogs-effnet-bsdynamic-1.json"
    onnx_path.write_bytes(b"onnx")
    json_path.write_text("{\"classes\": []}")

    called = {"count": 0}

    def fake_download(*_args, **_kwargs):
        called["count"] += 1
        raise RuntimeError("download should not be called")

    monkeypatch.setattr(downloader_module, "download_with_retries", fake_download)

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
        download_timeout=1.0,
        download_retries=1,
        request_timeout_sec=5.0,
        preload_model=False,
    )

    onnx, js, source = downloader_module.ensure_model_files(settings)
    assert Path(onnx).exists()
    assert Path(js).exists()
    assert source == "local"
    assert called["count"] == 0
