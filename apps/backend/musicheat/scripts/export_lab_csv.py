from __future__ import annotations

import csv
import os
import sys
from pathlib import Path
from typing import Iterable, Optional, Tuple

from mutagen import File as MutagenFile

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from title_cleaner import clean_title
from title_cleaner.lexicon import DEFAULT_LEXICON


AUDIO_EXTS = set(DEFAULT_LEXICON.audio_extensions)


def iter_audio_files(root: Path) -> Iterable[Path]:
    for dirpath, _, filenames in os.walk(root):
        for name in filenames:
            if name.startswith("."):
                continue
            path = Path(dirpath) / name
            if path.suffix.lower().lstrip(".") in AUDIO_EXTS:
                yield path


def read_tags(path: Path) -> Tuple[Optional[str], Optional[str], Optional[float]]:
    try:
        audio = MutagenFile(path)
    except Exception:
        return None, None, None
    if not audio:
        return None, None, None
    title = None
    artist = None
    duration = None
    try:
        if audio.tags:
            title = _first_tag_value(audio.tags, ("TIT2", "title"))
            artist = _first_tag_value(audio.tags, ("TPE1", "artist", "artists"))
        if audio.info:
            duration = getattr(audio.info, "length", None)
    except Exception:
        return title, artist, duration
    return title, artist, duration


def _first_tag_value(tags, keys: Tuple[str, ...]) -> Optional[str]:
    for key in keys:
        if key in tags:
            value = tags.get(key)
            if isinstance(value, (list, tuple)):
                value = value[0] if value else None
            if value is None:
                continue
            text = str(value).strip()
            if text:
                return text
    return None


def main() -> None:
    root = Path("/Users/apple/Desktop/lab")
    output_path = Path("/Users/apple/Desktop/lab_title_clean_results.csv")

    with output_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(
            [
                "file_path",
                "file_name",
                "raw_title",
                "raw_artist",
                "source",
                "duration_seconds",
                "normalized_title",
                "base_title",
                "main_artist",
                "featured_artists",
                "is_derivative",
                "derivative_type",
                "is_processing_noise",
                "processing_removed_tokens",
                "processing_removed_segments",
                "title_quality",
                "quality_reasons",
                "removed_segments",
                "removed_tokens",
                "split_strategy",
                "split_confidence",
                "warnings",
            ]
        )
        for path in iter_audio_files(root):
            tag_title, tag_artist, duration = read_tags(path)
            source = "id3" if tag_title or tag_artist else "filename"
            raw_title = tag_title if tag_title else path.stem
            raw_artist = tag_artist if tag_artist else None
            result = clean_title(
                raw_title=raw_title,
                raw_artist=raw_artist,
                duration_seconds=duration,
                source=source,
            )
            writer.writerow(
                [
                    str(path),
                    path.name,
                    result.raw_title,
                    result.raw_artist or "",
                    result.source,
                    f"{duration:.2f}" if duration is not None else "",
                    result.normalized_title,
                    result.base_title,
                    result.main_artist or "",
                    ";".join(result.featured_artists),
                    "1" if result.is_derivative else "0",
                    result.derivative_type or "",
                    "1" if result.is_processing_noise else "0",
                    ";".join(result.processing_removed_tokens),
                    ";".join(result.processing_removed_segments),
                    result.title_quality,
                    ";".join(result.quality_reasons),
                    ";".join(result.removed_segments),
                    ";".join(result.removed_tokens),
                    result.split_strategy or "",
                    f"{result.split_confidence:.2f}",
                    ";".join(result.warnings),
                ]
            )


if __name__ == "__main__":
    main()
