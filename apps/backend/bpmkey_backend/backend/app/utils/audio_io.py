from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from mutagen import File as MutagenFile
from fastapi import UploadFile


@dataclass
class TempAudioFile:
    path: Path
    filename: str
    _temp_dir: Optional[Path] = None

    def cleanup(self) -> None:
        try:
            if self.path.exists():
                self.path.unlink()
        finally:
            if self._temp_dir and self._temp_dir.exists():
                shutil.rmtree(self._temp_dir, ignore_errors=True)


def save_upload_file(upload: UploadFile, temp_dir: Optional[Path] = None) -> TempAudioFile:
    suffix = Path(upload.filename or "upload").suffix
    if temp_dir is None:
        temp_dir = Path(tempfile.mkdtemp(prefix="analyze-"))
    temp_path = temp_dir / f"{uuid.uuid4().hex}{suffix}"
    with temp_path.open("wb") as handle:
        shutil.copyfileobj(upload.file, handle)
    return TempAudioFile(path=temp_path, filename=upload.filename or temp_path.name, _temp_dir=temp_dir)


def save_local_file(path: Path) -> TempAudioFile:
    return TempAudioFile(path=path, filename=path.name, _temp_dir=None)


def get_duration_sec(path: Path) -> float:
    try:
        audio = MutagenFile(path)
        if audio is not None and getattr(audio, "info", None) is not None:
            length = getattr(audio.info, "length", None)
            if isinstance(length, (int, float)) and length > 0:
                return float(length)
    except Exception:
        pass
    return 0.0


def load_audio_for_librosa(path: Path, target_sr: int = 22050):
    try:
        import librosa
    except Exception as exc:  # pragma: no cover - optional dependency
        raise RuntimeError("librosa is not available") from exc
    try:
        y, sr = librosa.load(path, sr=target_sr, mono=True)
        return y, sr
    except Exception:
        return load_audio_via_ffmpeg(path, target_sr=target_sr)


def load_audio_via_ffmpeg(path: Path, target_sr: int = 22050):
    try:
        import soundfile as sf
    except Exception as exc:  # pragma: no cover - optional dependency
        raise RuntimeError("soundfile is not available") from exc

    ffmpeg_bin = os.getenv("FFMPEG_BIN", "ffmpeg")
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp_path = Path(tmp.name)

    try:
        cmd = [
            ffmpeg_bin,
            "-y",
            "-i",
            str(path),
            "-ac",
            "1",
            "-ar",
            str(target_sr),
            "-f",
            "wav",
            str(tmp_path),
        ]
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        data, sr = sf.read(tmp_path, dtype="float32")
        if getattr(data, "ndim", 1) > 1:
            data = data.mean(axis=1)
        return data, sr
    finally:
        try:
            tmp_path.unlink()
        except OSError:
            pass
