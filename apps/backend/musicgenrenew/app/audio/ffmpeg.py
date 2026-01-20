from __future__ import annotations

import subprocess
from typing import Optional, Tuple

import numpy as np

from ..config import get_settings


class FfmpegError(RuntimeError):
    pass


def decode_audio(
    path: str,
    sample_rate: int,
    mono: bool = True,
    clip_seconds: Optional[float] = None,
) -> Tuple[np.ndarray, int]:
    settings = get_settings()
    cmd = [
        settings.ffmpeg_bin,
        "-nostdin",
        "-v",
        "error",
        "-i",
        path,
        "-ac",
        "1" if mono else "2",
        "-ar",
        str(sample_rate),
        "-f",
        "f32le",
    ]
    if clip_seconds is not None:
        cmd.extend(["-t", str(clip_seconds)])
    cmd.append("pipe:1")

    proc = subprocess.run(cmd, check=False, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if proc.returncode != 0:
        raise FfmpegError(proc.stderr.decode("utf-8", errors="ignore"))

    audio = np.frombuffer(proc.stdout, dtype=np.float32)
    if audio.size == 0:
        raise FfmpegError("ffmpeg produced empty audio output")
    return audio, sample_rate
