import numpy as np

from app.segment import drop as drop_module


class _DropSettings:
    drop_seconds = 10.0
    drop_pre_roll_sec = 2.0
    drop_top_n = 3
    drop_candidates_k = 3
    drop_hop_sec = 0.1
    drop_frame_sec = 0.2
    drop_smooth_sec = 3.0
    drop_w1 = 1.0
    drop_w2 = 0.6
    drop_w3 = 0.4
    drop_w4 = 0.0
    drop_low_freq_min = 20.0
    drop_low_freq_max = 150.0
    drop_high_freq_max = 8000.0
    drop_min_duration_margin = 5.0


def test_detect_drop_segment_energy_peak():
    sr = 16000
    duration = 40.0
    t = np.linspace(0.0, duration, int(sr * duration), endpoint=False)
    base = 0.01 * np.random.RandomState(0).randn(t.size)

    drop_start = 15.0
    drop_end = 25.0
    drop_mask = (t >= drop_start) & (t < drop_end)
    drop_signal = 0.5 * np.sin(2 * np.pi * 60.0 * t)
    waveform = base + drop_signal * drop_mask.astype(np.float32)

    start_sec, end_sec = drop_module._detect_drop_segment(
        waveform.astype(np.float32),
        sr,
        _DropSettings(),
        strategy="energy",
    )

    assert start_sec <= 20.0 <= end_sec
    assert abs((end_sec - start_sec) - _DropSettings.drop_seconds) <= 2.0
