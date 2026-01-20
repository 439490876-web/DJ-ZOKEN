from app.services.bpm_utils import correct_bpm_for_dj, format_bpm


def test_correct_bpm_for_dj_upscale():
    bpm, changed = correct_bpm_for_dj(60.0)
    assert changed
    assert 70.0 <= bpm <= 120.0


def test_correct_bpm_for_dj_downscale():
    bpm, changed = correct_bpm_for_dj(240.0)
    assert changed
    assert 100.0 <= bpm <= 180.0


def test_format_bpm():
    assert format_bpm(128.0) == "128.0"
