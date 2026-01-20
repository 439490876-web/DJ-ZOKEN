import numpy as np

from app.audio import preprocess as preprocess_module
from app.audio.preprocess import preprocess_audio


def test_preprocess_audio_with_mocked_ffmpeg(monkeypatch):
    audio = np.linspace(-0.5, 0.5, 16000, dtype=np.float32)

    def fake_decode(_path, sample_rate, mono=True, clip_seconds=None):
        return audio, sample_rate

    monkeypatch.setattr(preprocess_module, "decode_audio", fake_decode)

    patches, duration_sec = preprocess_audio(
        "fake.wav",
        sample_rate=16000,
        clip_seconds=2.0,
        pad_mode="zero",
        n_mels=128,
        frame_size=400,
        hop_size=160,
        patch_frames=96,
        patch_hop_frames=96,
        use_essentia=False,
    )

    assert patches.dtype == np.float32
    assert patches.shape[1:] == (128, 96)
    assert patches.shape[0] >= 1
    assert abs(duration_sec - 1.0) < 0.01
