from app.services.analyzer import analyze_bpm_key
from app.services.tags import TagResult


def test_analyze_uses_tags(monkeypatch, tmp_path):
    test_file = tmp_path / "song.mp3"
    test_file.write_bytes(b"fake")

    tag_result = TagResult(
        bpm=128.0,
        key_text="A minor",
        key_camelot="8A",
        raw_tags={"TBPM": "128"},
        warnings=[],
        vendor="serato",
    )

    monkeypatch.setattr("app.services.analyzer.extract_tags", lambda _: tag_result)
    monkeypatch.setattr("app.services.analyzer.essentia_available", lambda: False)
    monkeypatch.setattr("app.services.analyzer.librosa_available", lambda: False)
    monkeypatch.setattr("app.services.analyzer.get_duration_sec", lambda _: 123.4)

    result = analyze_bpm_key(test_file, "song.mp3")
    assert result.track["bpm"] == 128.0
    assert result.track["key_camelot"] == "8A"
    assert result.track["source"] == "serato"
