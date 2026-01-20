import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from title_cleaner import clean_title


CASES = [
    {
        "name": "bracketed_remix_split",
        "raw_title": "The Weeknd - Blinding Lights (DJ XXX Remix)",
        "expected_artist": "The Weeknd",
        "expected_base": "Blinding Lights",
        "expected_derivative_type": "REMIX",
        "expected_is_derivative": True,
    },
    {
        "name": "ambiguous_reversed",
        "raw_title": "Blinding Lights - The Weeknd",
        "expected_artist": "Blinding Lights",
        "expected_base": "The Weeknd",
        "expect_warning": "ambiguous_split",
        "max_confidence": 0.6,
    },
    {
        "name": "feat_and_radio_edit",
        "raw_title": "Artist - Title (feat. A, B) [Radio Edit]",
        "expected_artist": "Artist",
        "expected_base": "Title (feat. A, B)",
        "expected_featured": ["A", "B"],
        "expected_derivative_type": "EDIT",
        "expected_is_derivative": True,
    },
    {
        "name": "ch_live_bracket",
        "raw_title": "某艺人 - 某某歌名（现场版）",
        "expected_artist": "某艺人",
        "expected_base": "某某歌名",
        "expected_derivative_type": "LIVE",
        "expected_is_derivative": True,
    },
    {
        "name": "raw_artist_priority",
        "raw_title": "Hello (Official Video)",
        "raw_artist": "Adele",
        "expected_artist": "Adele",
        "expected_base": "Hello",
        "expected_is_derivative": False,
        "expect_warning": "noise_stripped",
    },
    {
        "name": "noise_prefix_and_dj_version",
        "raw_title": "抖音热歌2026-某某歌名DJ版",
        "expected_base": "某某歌名",
        "expect_warning": "noise_stripped",
    },
    {
        "name": "pipe_split_extended",
        "raw_title": "Artist | Title (Extended Mix)",
        "expected_artist": "Artist",
        "expected_base": "Title",
        "expected_derivative_type": "EXTENDED",
        "expected_strategy": "PIPE",
    },
    {
        "name": "slash_split_acoustic",
        "raw_title": "Artist / Title (Acoustic)",
        "expected_artist": "Artist",
        "expected_base": "Title",
        "expected_derivative_type": "ACOUSTIC",
        "expected_strategy": "SLASH",
    },
    {
        "name": "underscore_split",
        "raw_title": "Artist_Title",
        "expected_artist": "Artist",
        "expected_base": "Title",
        "expected_strategy": "UNDERSCORE",
    },
    {
        "name": "inline_feat",
        "raw_title": "Artist - Title feat. A & B",
        "expected_artist": "Artist",
        "expected_featured": ["A", "B"],
        "base_contains": "feat.",
    },
    {
        "name": "feat_in_artist",
        "raw_title": "Artist feat. B - Title",
        "expected_artist": "Artist",
        "expected_base": "Title",
        "expected_featured": ["B"],
    },
    {
        "name": "feat_keep_live_remove",
        "raw_title": "Title (feat. A) (Live)",
        "expected_base": "Title (feat. A)",
        "expected_featured": ["A"],
        "expected_derivative_type": "LIVE",
    },
    {
        "name": "slowed_reverb",
        "raw_title": "Title [Slowed+Reverb]",
        "expected_base": "Title",
        "expected_derivative_type": "SLOWED",
    },
    {
        "name": "instrumental",
        "raw_title": "Title (Instrumental)",
        "expected_base": "Title",
        "expected_derivative_type": "INSTRUMENTAL",
    },
    {
        "name": "intro",
        "raw_title": "Artist - Title (Intro)",
        "expected_artist": "Artist",
        "expected_base": "Title",
        "expected_derivative_type": "INTRO",
    },
    {
        "name": "outro",
        "raw_title": "Artist - Title (Outro)",
        "expected_artist": "Artist",
        "expected_base": "Title",
        "expected_derivative_type": "OUTRO",
    },
    {
        "name": "version",
        "raw_title": "Artist - Title (Version)",
        "expected_artist": "Artist",
        "expected_base": "Title",
        "expected_derivative_type": "VERSION",
    },
    {
        "name": "club_mix",
        "raw_title": "Artist - Title (Club Mix)",
        "expected_artist": "Artist",
        "expected_base": "Title",
        "expected_derivative_type": "EXTENDED",
    },
    {
        "name": "remix_then_feat",
        "raw_title": "Artist - Title (Remix) (feat. A)",
        "expected_artist": "Artist",
        "expected_base": "Title (feat. A)",
        "expected_featured": ["A"],
        "expected_derivative_type": "REMIX",
    },
    {
        "name": "feat_with_noise_bracket",
        "raw_title": "Artist - Title (feat. A) [Official Video]",
        "expected_artist": "Artist",
        "expected_base": "Title (feat. A)",
        "expected_featured": ["A"],
        "expect_warning": "noise_stripped",
    },
    {
        "name": "tail_remix",
        "raw_title": "Artist - Title - Remix",
        "expected_artist": "Artist",
        "expected_base": "Title",
        "expected_derivative_type": "REMIX",
    },
    {
        "name": "dj_version_bracket",
        "raw_title": "Artist - Title (DJ版)",
        "expected_artist": "Artist",
        "expected_base": "Title",
        "expected_derivative_type": "EDIT",
    },
    {
        "name": "fullwidth_brackets",
        "raw_title": "Artist - Title（Remix）",
        "expected_artist": "Artist",
        "expected_base": "Title",
        "expected_derivative_type": "REMIX",
    },
    {
        "name": "emdash_split",
        "raw_title": "Artist — Title",
        "expected_artist": "Artist",
        "expected_base": "Title",
        "expected_strategy": "DASH",
    },
    {
        "name": "slash_in_artist",
        "raw_title": "AC/DC - Thunderstruck",
        "expected_artist": "AC/DC",
        "expected_base": "Thunderstruck",
    },
    {
        "name": "extension_removed",
        "raw_title": "The Weeknd - Blinding Lights.mp3",
        "expected_artist": "The Weeknd",
        "expected_base": "Blinding Lights",
    },
    {
        "name": "lyrics_noise",
        "raw_title": "Title (Lyrics)",
        "expected_base": "Title",
        "expect_warning": "noise_stripped",
    },
    {
        "name": "official_video_suffix",
        "raw_title": "Title - Official Video",
        "expected_base": "Title",
        "expect_warning": "noise_stripped",
    },
    {
        "name": "clean_version",
        "raw_title": "Title (Clean)",
        "expected_base": "Title",
        "expected_derivative_type": "VERSION",
    },
    {
        "name": "explicit_version",
        "raw_title": "Title (Explicit)",
        "expected_base": "Title",
        "expected_derivative_type": "VERSION",
    },
    {
        "name": "banzou",
        "raw_title": "Artist - Title (伴奏)",
        "expected_artist": "Artist",
        "expected_base": "Title",
        "expected_derivative_type": "INSTRUMENTAL",
    },
    {
        "name": "pure_music",
        "raw_title": "Artist - Title (纯音乐)",
        "expected_artist": "Artist",
        "expected_base": "Title",
        "expected_derivative_type": "INSTRUMENTAL",
    },
    {
        "name": "kou_shui",
        "raw_title": "Artist - Title (口水版)",
        "expected_artist": "Artist",
        "expected_base": "Title",
        "expected_derivative_type": "VERSION",
    },
    {
        "name": "multi_dash_ambiguous",
        "raw_title": "A - B - C",
        "expected_base": "B-C",
        "expect_warning": "ambiguous_split",
    },
    {
        "name": "demo_version",
        "raw_title": "Artist - Title (Demo)",
        "expected_artist": "Artist",
        "expected_base": "Title",
        "expected_derivative_type": "VERSION",
    },
    {
        "name": "speed_up",
        "raw_title": "Title (Speed Up)",
        "expected_base": "Title",
        "expected_derivative_type": "SPEED_UP",
    },
    {
        "name": "processing_tail_tokens",
        "raw_title": "China_AI_WAV_Sync",
        "expected_base": "China",
        "expected_processing_tokens": ["ai", "wav", "sync"],
        "expected_processing_noise": True,
        "expected_quality": "LOW_CONFIDENCE",
    },
    {
        "name": "processing_only_title",
        "raw_title": "Mix_Structural34",
        "expected_base": "Mix_Structural34",
        "expected_processing_noise": True,
        "expected_quality": "NOT_A_SONG_TITLE",
        "quality_reason_any": ["mostly_processing_tokens", "looks_like_export_name"],
    },
    {
        "name": "remix_with_processing_tail",
        "raw_title": "Song Name (DJ XXX Remix) AI WAV",
        "expected_base": "Song Name",
        "expected_derivative_type": "REMIX",
        "expected_processing_tokens": ["ai", "wav"],
        "expected_processing_noise": True,
    },
    {
        "name": "weak_processing_no_strong",
        "raw_title": "Artist - Title - v3 final",
        "expected_artist": "Artist",
        "expected_base": "Title-v3 final",
        "expected_processing_noise": True,
        "expected_quality": "LOW_CONFIDENCE",
        "quality_reason": "processing_tokens_left",
    },
    {
        "name": "stems_suffix",
        "raw_title": "Artist - Title (feat. A) _STEMS",
        "expected_artist": "Artist",
        "expected_base": "Title (feat. A)",
        "expected_featured": ["A"],
        "expected_processing_tokens": ["stems"],
        "expected_processing_noise": True,
    },
    {
        "name": "processing_bracket",
        "raw_title": "Song Name [AI WAV SYNC]",
        "expected_base": "Song Name",
        "expected_processing_tokens": ["ai", "wav", "sync"],
        "expected_processing_noise": True,
    },
    {
        "name": "processing_with_structural_number",
        "raw_title": "Artist - Title - Structural34",
        "expected_artist": "Artist",
        "expected_base": "Title",
        "expected_processing_tokens": ["structural"],
        "expected_processing_noise": True,
    },
    {
        "name": "processing_v2_with_strong",
        "raw_title": "Artist - Title - AI v2",
        "expected_artist": "Artist",
        "expected_base": "Title",
        "expected_processing_tokens": ["ai", "v2"],
        "expected_processing_noise": True,
    },
    {
        "name": "processing_final_with_strong",
        "raw_title": "Title AI final",
        "expected_base": "Title",
        "expected_processing_tokens": ["ai", "final"],
        "expected_processing_noise": True,
    },
    {
        "name": "processing_mix_export",
        "raw_title": "export_v3_final",
        "expected_base": "export_v3_final",
        "expected_processing_noise": True,
        "expected_quality": "NOT_A_SONG_TITLE",
        "quality_reason_any": ["looks_like_export_name", "mostly_processing_tokens"],
    },
]


@pytest.mark.parametrize("case", CASES, ids=[case["name"] for case in CASES])
def test_cleaner_cases(case):
    result = clean_title(case["raw_title"], raw_artist=case.get("raw_artist"))

    if "expected_artist" in case:
        assert result.main_artist == case["expected_artist"]
    if "expected_base" in case:
        assert result.base_title == case["expected_base"]
    if "expected_featured" in case:
        assert result.featured_artists == case["expected_featured"]
    if "expected_derivative_type" in case:
        assert result.derivative_type == case["expected_derivative_type"]
    if "expected_is_derivative" in case:
        assert result.is_derivative == case["expected_is_derivative"]
    if "expected_processing_noise" in case:
        assert result.is_processing_noise == case["expected_processing_noise"]
    if "expected_processing_tokens" in case:
        for token in case["expected_processing_tokens"]:
            assert token in result.processing_removed_tokens
    if "expected_quality" in case:
        assert result.title_quality == case["expected_quality"]
    if "quality_reason" in case:
        assert case["quality_reason"] in result.quality_reasons
    if "quality_reason_any" in case:
        assert any(reason in result.quality_reasons for reason in case["quality_reason_any"])
    if "expected_strategy" in case:
        assert result.split_strategy == case["expected_strategy"]
    if "expect_warning" in case:
        assert case["expect_warning"] in result.warnings
    if "base_contains" in case:
        assert case["base_contains"] in result.base_title
    if "max_confidence" in case:
        assert result.split_confidence <= case["max_confidence"]
