from __future__ import annotations

import re
import unicodedata
from dataclasses import asdict
from typing import Iterable, List, Optional, Tuple

from .lexicon import DEFAULT_LEXICON, Lexicon
from .models import TitleCleanResult


BRACKET_PAIRS = {
    "(": ")",
    "[": "]",
    "{": "}",
    "<": ">",
    "（": "）",
    "【": "】",
    "『": "』",
    "《": "》",
    "「": "」",
    "〔": "〕",
}
BRACKET_OPENERS = set(BRACKET_PAIRS.keys())
BRACKET_CLOSERS = set(BRACKET_PAIRS.values())

FEAT_PATTERN = re.compile(r"(?i)\b(feat\.?|ft\.?|featuring)\b")
FEAT_STRIP_PATTERN = re.compile(
    r"(?i)\s*[\(\[\{]?\s*(feat\.?|ft\.?|featuring)\b.*$"
)

TOKEN_PATTERN = re.compile(r"[A-Za-z0-9]+|[\u4e00-\u9fff]+")
SEGMENT_SPLIT_PATTERN = re.compile(r"([_\-\/|])")


def _contains_cjk(text: str) -> bool:
    return any("\u4e00" <= ch <= "\u9fff" for ch in text)


def _normalize_for_match(text: str) -> str:
    text = unicodedata.normalize("NFKC", text).lower()
    text = re.sub(r"[\-–—_/|]+", " ", text)
    text = re.sub(r"[^\w\s\u4e00-\u9fff]+", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _build_keyword_patterns(keywords: Iterable[str]) -> List[Tuple[str, Optional[re.Pattern]]]:
    patterns: List[Tuple[str, Optional[re.Pattern]]] = []
    for keyword in keywords:
        if _contains_cjk(keyword):
            patterns.append((keyword, None))
            continue
        normalized = re.sub(r"[^\w\s]+", " ", keyword.lower()).strip()
        if not normalized:
            patterns.append((keyword, None))
            continue
        tokens = normalized.split()
        pattern = r"(?<!\w)" + r"\s+".join(map(re.escape, tokens)) + r"(?!\w)"
        patterns.append((keyword, re.compile(pattern, re.IGNORECASE)))
    return patterns


def _build_loose_tail_patterns(
    keywords: Iterable[str],
) -> List[Tuple[str, Optional[re.Pattern]]]:
    patterns: List[Tuple[str, Optional[re.Pattern]]] = []
    for keyword in keywords:
        if _contains_cjk(keyword):
            patterns.append((keyword, None))
            continue
        tokens = re.findall(r"[a-z0-9]+", keyword.lower())
        if not tokens:
            patterns.append((keyword, None))
            continue
        pattern = r"(?<!\w)" + r"[\s\-_+]*".join(map(re.escape, tokens)) + r"(?!\w)"
        patterns.append((keyword, re.compile(pattern, re.IGNORECASE)))
    return patterns


def _normalize_processing_token(token: str) -> str:
    token = unicodedata.normalize("NFKC", token).lower()
    token = re.sub(r"[^\w\u4e00-\u9fff]+", "", token)
    return token


def _strip_digits(token: str) -> str:
    return re.sub(r"\d+", "", token)


def _match_processing_token(token: str, lexicon: Lexicon) -> Tuple[Optional[str], Optional[str]]:
    if not token:
        return None, None
    normalized = _normalize_processing_token(token)
    if not normalized:
        return None, None
    strong_set = set(lexicon.processing_tokens_strong)
    weak_set = set(lexicon.processing_tokens_weak)
    if normalized in strong_set:
        return "strong", normalized
    if normalized in weak_set:
        return "weak", normalized
    stripped = _strip_digits(normalized)
    if stripped in strong_set:
        return "strong", stripped
    if stripped in weak_set:
        return "weak", stripped
    return None, None


def _processing_tokens_in_text(text: str, lexicon: Lexicon) -> Tuple[int, List[Tuple[str, str]]]:
    tokens = TOKEN_PATTERN.findall(_normalize_for_match(text))
    matches: List[Tuple[str, str]] = []
    for token in tokens:
        kind, matched = _match_processing_token(token, lexicon)
        if kind and matched:
            matches.append((kind, matched))
    return len(tokens), matches


def _split_segments_with_separators(text: str) -> List[Tuple[str, str]]:
    if not text:
        return []
    parts = SEGMENT_SPLIT_PATTERN.split(text)
    segments: List[Tuple[str, str]] = []
    sep = ""
    for part in parts:
        if part in {"_", "-", "/", "|"}:
            sep = part
            continue
        if part == "":
            continue
        segments.append((sep, part))
        sep = ""
    return segments


def _rebuild_segments(segments: List[Tuple[str, str]]) -> str:
    return "".join(sep + segment for sep, segment in segments)


STRONG_PATTERNS = _build_keyword_patterns(DEFAULT_LEXICON.strong_keywords)
WEAK_PATTERNS = _build_keyword_patterns(DEFAULT_LEXICON.weak_keywords)
NOISE_PATTERNS = _build_keyword_patterns(DEFAULT_LEXICON.noise_phrases)
TAIL_STRONG_PATTERNS = _build_loose_tail_patterns(DEFAULT_LEXICON.strong_keywords)
TAIL_WEAK_PATTERNS = _build_loose_tail_patterns(DEFAULT_LEXICON.weak_keywords)
PROCESSING_WEAK_SPECIAL = {
    "v2",
    "v3",
    "v4",
    "take2",
    "take3",
    "final",
    "edit2",
    "edit3",
    "demo2",
    "r1",
    "r2",
}


def _unique_extend(target: List[str], items: Iterable[str]) -> None:
    for item in items:
        if item not in target:
            target.append(item)


def _normalize_title(raw_title: str, lexicon: Lexicon) -> str:
    if not raw_title:
        return ""
    title = raw_title.strip()
    ext_pattern = r"\.(" + "|".join(re.escape(ext) for ext in lexicon.audio_extensions) + r")$"
    title = re.sub(ext_pattern, "", title, flags=re.IGNORECASE)
    title = unicodedata.normalize("NFKC", title)
    title = title.replace("–", "-").replace("—", "-").replace("−", "-")
    title = re.sub(r"[\t\r\n]+", " ", title)
    title = re.sub(r"\s+", " ", title).strip()
    return title


def _extract_bracket_segments(text: str) -> List[Tuple[int, int, str]]:
    stack: List[Tuple[int, str]] = []
    segments: List[Tuple[int, int, str]] = []
    for idx, ch in enumerate(text):
        if ch in BRACKET_OPENERS:
            stack.append((idx, ch))
            continue
        if ch in BRACKET_CLOSERS and stack:
            start, opener = stack[-1]
            if BRACKET_PAIRS.get(opener) == ch:
                stack.pop()
                segments.append((start, idx, text[start + 1 : idx]))
    segments.sort(key=lambda seg: (seg[0], -(seg[1] - seg[0])))
    return segments


def _find_keyword_hits(
    text: str, patterns: List[Tuple[str, Optional[re.Pattern]]]
) -> List[str]:
    if not text:
        return []
    lowered = text.lower()
    normalized = _normalize_for_match(text)
    hits: List[str] = []
    for keyword, pattern in patterns:
        if pattern is None:
            if keyword.lower() in lowered:
                hits.append(keyword)
            continue
        if pattern.search(normalized):
            hits.append(keyword)
    return hits


def _extract_feat_from_segment(segment: str) -> List[str]:
    matches = list(FEAT_PATTERN.finditer(segment))
    if not matches:
        return []
    artists: List[str] = []
    for match in matches:
        tail = segment[match.end() :].strip()
        if not tail:
            continue
        stop = len(tail)
        for stopper in (")", "]", "}", ">", "|", "/", "-", "_"):
            pos = tail.find(stopper)
            if pos != -1:
                stop = min(stop, pos)
        chunk = tail[:stop]
        chunk = chunk.strip(" .:-_[](){}<>")
        artists.extend(_split_artist_list(chunk))
    return _dedupe_artists(artists)


def _split_artist_list(text: str) -> List[str]:
    if not text:
        return []
    parts = re.split(r"\s*(?:,|&|\+|x|X|and|与|、)\s*", text)
    artists: List[str] = []
    for part in parts:
        cleaned = part.strip(" .")
        if cleaned:
            artists.append(cleaned)
    return artists


def _dedupe_artists(artists: Iterable[str]) -> List[str]:
    seen: set[str] = set()
    result: List[str] = []
    for artist in artists:
        if artist not in seen:
            seen.add(artist)
            result.append(artist)
    return result


def _strip_feat_from_artist(text: str) -> str:
    cleaned = FEAT_STRIP_PATTERN.sub("", text).strip()
    return cleaned


def _remove_spans(text: str, spans: List[Tuple[int, int]]) -> str:
    if not spans:
        return text
    result = text
    for start, end in sorted(spans, key=lambda x: x[0], reverse=True):
        result = result[:start] + result[end + 1 :]
    return result


def _strip_bracket_segments(
    text: str,
    lexicon: Lexicon,
    removed_segments: List[str],
    removed_tokens: List[str],
    featured_artists: List[str],
) -> Tuple[str, List[str]]:
    derivative_hits: List[str] = []
    segments = _extract_bracket_segments(text)
    removal_spans: List[Tuple[int, int]] = []

    for start, end, content in segments:
        if any(start >= s and end <= e for s, e in removal_spans):
            continue
        strong_hits = _find_keyword_hits(content, STRONG_PATTERNS)
        weak_hits = _find_keyword_hits(content, WEAK_PATTERNS)
        noise_hits = _find_keyword_hits(content, NOISE_PATTERNS)
        feat_hits = _extract_feat_from_segment(content)
        if strong_hits or weak_hits:
            removal_spans.append((start, end))
            removed_segments.append(text[start : end + 1].strip())
            _unique_extend(removed_tokens, strong_hits + weak_hits)
            derivative_hits.extend(strong_hits + weak_hits)
            continue
        if noise_hits and not feat_hits:
            removal_spans.append((start, end))
            removed_segments.append(text[start : end + 1].strip())
            _unique_extend(removed_tokens, noise_hits)
            continue
        if feat_hits:
            _unique_extend(featured_artists, feat_hits)

    cleaned = _remove_spans(text, removal_spans)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned, derivative_hits


def _tail_cut(
    text: str,
    lexicon: Lexicon,
    removed_segments: List[str],
    removed_tokens: List[str],
) -> Tuple[str, List[str]]:
    if not text:
        return text, []
    derivative_hits: List[str] = []
    lowered = text.lower()
    tokens = list(TOKEN_PATTERN.finditer(lowered))
    if not tokens:
        return text, []
    tail_start = tokens[-5].start() if len(tokens) >= 5 else 0
    tail_sub = lowered[tail_start:]

    best_start: Optional[int] = None
    best_keyword: Optional[str] = None

    for keyword, pattern in TAIL_STRONG_PATTERNS + TAIL_WEAK_PATTERNS:
        if pattern is None:
            idx = tail_sub.find(keyword.lower())
            if idx == -1:
                continue
            match_start = tail_start + idx
        else:
            match = pattern.search(tail_sub)
            if not match:
                continue
            match_start = tail_start + match.start()
        if best_start is None or match_start < best_start:
            best_start = match_start
            best_keyword = keyword

    if best_start is None or best_keyword is None:
        return text, []

    sep_match = re.search(r"[\-|/|_]\s*$", text[:best_start])
    cut_start = sep_match.start() if sep_match else best_start
    removed = text[cut_start:].strip()
    if removed:
        removed_segments.append(removed)
    cleaned = text[:cut_start].strip()
    if len(cleaned) < 2:
        return text, []

    derivative_hits.append(best_keyword)
    _unique_extend(removed_tokens, [best_keyword])
    return cleaned, derivative_hits


def _strip_noise_segments(
    text: str,
    lexicon: Lexicon,
    removed_segments: List[str],
    removed_tokens: List[str],
) -> str:
    if not text:
        return text
    cleaned = text
    lower = cleaned.lower()
    for phrase in lexicon.noise_phrases:
        phrase_lower = phrase.lower()
        if not phrase_lower:
            continue
        if re.search(rf"(?i)(?:\s+{re.escape(phrase_lower)})\s*$", lower):
            match = re.search(rf"(?i)\s+{re.escape(phrase_lower)}\s*$", lower)
            if match:
                removed_segments.append(cleaned[match.start() :].strip())
                _unique_extend(removed_tokens, [phrase])
                cleaned = cleaned[: match.start()].strip()
                lower = cleaned.lower()

    parts = re.split(r"\s*[-|/_]\s*", cleaned)
    if len(parts) > 1:
        first = parts[0].strip()
        last = parts[-1].strip()
        removed_any = False
        for phrase in lexicon.noise_phrases:
            phrase_lower = phrase.lower()
            if first and phrase_lower in first.lower():
                removed_segments.append(first)
                _unique_extend(removed_tokens, [phrase])
                parts = parts[1:]
                removed_any = True
                break
        for phrase in lexicon.noise_phrases:
            phrase_lower = phrase.lower()
            if last and phrase_lower in last.lower():
                removed_segments.append(last)
                _unique_extend(removed_tokens, [phrase])
                parts = parts[:-1]
                removed_any = True
                break
        if removed_any and parts:
            cleaned = " - ".join(part.strip() for part in parts if part.strip())
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


def _strip_processing_brackets(
    text: str,
    lexicon: Lexicon,
    processing_removed_segments: List[str],
    processing_removed_tokens: List[str],
) -> str:
    segments = _extract_bracket_segments(text)
    removal_spans: List[Tuple[int, int]] = []
    for start, end, content in segments:
        if any(start >= s and end <= e for s, e in removal_spans):
            continue
        feat_hits = _extract_feat_from_segment(content)
        if feat_hits:
            continue
        token_count, matches = _processing_tokens_in_text(content, lexicon)
        if not matches:
            continue
        strong_present = any(kind == "strong" for kind, _ in matches)
        ratio = len(matches) / max(token_count, 1)
        if strong_present or ratio >= 0.6:
            removal_spans.append((start, end))
            processing_removed_segments.append(text[start : end + 1].strip())
            for _, token in matches:
                processing_removed_tokens.append(token)
    cleaned = _remove_spans(text, removal_spans)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


def _strip_processing_tokens_from_segment(
    segment: str,
    lexicon: Lexicon,
    strong_present_in_title: bool,
    removed_before: bool,
    segment_sep: str,
    segment_is_tail: bool,
) -> Tuple[str, List[str], bool]:
    tokens = segment.strip().split()
    if not tokens:
        return segment, [], removed_before
    token_matches: List[Tuple[Optional[str], Optional[str]]] = []
    for token in tokens:
        token_matches.append(_match_processing_token(token, lexicon))

    strong_count = sum(1 for kind, _ in token_matches if kind == "strong")
    strong_ratio = strong_count / max(len(tokens), 1)
    removed_tokens: List[str] = []
    removed_any = removed_before
    new_tokens = tokens[:]

    i = len(tokens) - 1
    while i >= 0:
        kind, matched = token_matches[i]
        if not kind or not matched:
            break
        if kind == "strong":
            removed_tokens.append(matched)
            new_tokens.pop(i)
            removed_any = True
            i -= 1
            continue
        pos_from_end = len(tokens) - i
        allow_remove = False
        if pos_from_end <= 3 and (strong_present_in_title or removed_any):
            allow_remove = True
        if matched in PROCESSING_WEAK_SPECIAL and removed_any:
            allow_remove = True
        if segment_sep == "_" and segment_is_tail and strong_ratio >= 0.5:
            allow_remove = True
        if not allow_remove:
            break
        removed_tokens.append(matched)
        new_tokens.pop(i)
        removed_any = True
        i -= 1

    cleaned = " ".join(new_tokens).strip()
    return cleaned, removed_tokens, removed_any


def _strip_processing_tags(
    text: str,
    lexicon: Lexicon,
    processing_removed_segments: List[str],
    processing_removed_tokens: List[str],
    warnings: List[str],
) -> str:
    if not text:
        return text

    original_text = text
    initial_segments_len = len(processing_removed_segments)
    initial_tokens_len = len(processing_removed_tokens)

    text = _strip_processing_brackets(
        text, lexicon, processing_removed_segments, processing_removed_tokens
    )
    segments = _split_segments_with_separators(text)
    if not segments:
        return text

    _, matches = _processing_tokens_in_text(text, lexicon)
    strong_present_in_title = any(kind == "strong" for kind, _ in matches)

    removed_any = False
    processed = 0
    idx = len(segments) - 1
    while idx >= 0:
        sep, segment = segments[idx]
        segment_is_tail = idx == len(segments) - 1
        should_process = processed < 2
        if not should_process and removed_any and sep == "_":
            token_count, matches = _processing_tokens_in_text(segment, lexicon)
            strong_count = sum(1 for kind, _ in matches if kind == "strong")
            if token_count > 0 and strong_count / token_count >= 0.5:
                should_process = True
        if not should_process:
            break
        cleaned_segment, removed_tokens, removed_any = _strip_processing_tokens_from_segment(
            segment,
            lexicon,
            strong_present_in_title,
            removed_any,
            sep,
            segment_is_tail,
        )
        if removed_tokens:
            processing_removed_tokens.extend(removed_tokens)
        if cleaned_segment.strip() == "":
            removed_segment = f"{sep}{segment}".strip()
            if removed_segment:
                processing_removed_segments.append(removed_segment)
            segments.pop(idx)
        else:
            segments[idx] = (sep, cleaned_segment)
        processed += 1
        idx -= 1

    cleaned = _rebuild_segments(segments)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    if len(cleaned) < 2:
        warnings.append("too_short_after_processing_strip")
        del processing_removed_segments[initial_segments_len:]
        del processing_removed_tokens[initial_tokens_len:]
        return original_text
    return cleaned


def _looks_like_export_name(text: str, lexicon: Lexicon) -> bool:
    token_count, matches = _processing_tokens_in_text(text, lexicon)
    if token_count == 0:
        return False
    processing_count = len(matches)
    if processing_count == token_count and processing_count > 0:
        return True
    normalized = _normalize_for_match(text)
    if re.match(r"^(mix|export|render|bounce|bounced)\b", normalized):
        return True
    return False


def _assess_title_quality(
    normalized_title: str,
    base_title: str,
    processing_removed_tokens: List[str],
    lexicon: Lexicon,
    warnings: List[str],
    split_confidence: float,
) -> Tuple[str, List[str], float]:
    quality_reasons: List[str] = []
    total_tokens, _ = _processing_tokens_in_text(normalized_title, lexicon)
    _, remaining_matches = _processing_tokens_in_text(base_title, lexicon)
    remaining_tokens = len(remaining_matches)
    processing_ratio = (len(processing_removed_tokens) + remaining_tokens) / max(total_tokens, 1)
    base_tokens = TOKEN_PATTERN.findall(_normalize_for_match(base_title))
    strong_present = any(kind == "strong" for kind, _ in remaining_matches)

    if processing_ratio >= 0.6:
        if remaining_tokens > 0 or strong_present:
            quality_reasons.append("mostly_processing_tokens")
            return "NOT_A_SONG_TITLE", quality_reasons, min(split_confidence, 0.3)
        quality_reasons.append("processing_tokens_stripped")
        return "LOW_CONFIDENCE", quality_reasons, min(split_confidence, 0.7)

    if _looks_like_export_name(normalized_title, lexicon):
        quality_reasons.append("looks_like_export_name")
        return "NOT_A_SONG_TITLE", quality_reasons, min(split_confidence, 0.3)

    if len(base_title) < 2:
        quality_reasons.append("too_short_after_strip")
        return "LOW_CONFIDENCE", quality_reasons, min(split_confidence, 0.5)

    if processing_removed_tokens:
        quality_reasons.append("processing_tokens_stripped")
        return "LOW_CONFIDENCE", quality_reasons, min(split_confidence, 0.7)

    if remaining_tokens > 0:
        quality_reasons.append("processing_tokens_left")
        return "LOW_CONFIDENCE", quality_reasons, min(split_confidence, 0.6)

    if "ambiguous_split" in warnings:
        quality_reasons.append("ambiguous_split")
        return "LOW_CONFIDENCE", quality_reasons, min(split_confidence, 0.7)

    return "OK", quality_reasons, split_confidence


def _choose_derivative_type(
    lexicon: Lexicon, derivative_hits: Iterable[str]
) -> Optional[str]:
    types: List[str] = []
    for keyword in derivative_hits:
        dtype = lexicon.derivative_type_map.get(keyword)
        if dtype:
            types.append(dtype)
    if not types:
        return None
    for dtype in lexicon.derivative_priority:
        if dtype in types:
            return dtype
    return "UNKNOWN"


def _clean_artist_name(text: Optional[str], lexicon: Lexicon) -> Optional[str]:
    if not text:
        return None
    cleaned = _normalize_title(text, lexicon)
    cleaned = _strip_feat_from_artist(cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned or None


def _score_artist_left(left: str, right: str) -> float:
    if not left or not right:
        return 0.0
    score = 0.5
    left_tokens = TOKEN_PATTERN.findall(left)
    right_tokens = TOKEN_PATTERN.findall(right)
    if len(left_tokens) <= 6 and len(left) <= 40:
        score += 0.2
    if re.search(r"(?i)\b(and|x)\b|[&与]", left):
        score += 0.1
    if re.match(r"^\d+", left):
        score -= 0.2
    if '"' in left or "'" in left:
        score -= 0.1
    if len(right_tokens) > len(left_tokens):
        score += 0.1
    if FEAT_PATTERN.search(right):
        score += 0.1
    return max(0.0, min(1.0, score))


def _split_artist_title(text: str) -> Tuple[Optional[str], str, Optional[str], float, List[str]]:
    warnings: List[str] = []
    candidates: List[Tuple[str, str, str, float]] = []

    def add_candidate(strategy: str, left: str, right: str, base_conf: float) -> None:
        left = left.strip()
        right = right.strip()
        if not left or not right:
            return
        if len(left) > 80 or len(right) < 1:
            return
        score = _score_artist_left(left, right)
        confidence = max(0.0, min(1.0, base_conf * score + 0.1))
        candidates.append((left, right, strategy, confidence))

    dash_parts = re.split(r"\s*-\s*", text)
    if len(dash_parts) >= 2:
        add_candidate("DASH", dash_parts[0], "-".join(dash_parts[1:]), 0.85)
        add_candidate("DASH", "-".join(dash_parts[:-1]), dash_parts[-1], 0.75)

    pipe_parts = re.split(r"\s*\|\s*", text)
    if len(pipe_parts) == 2:
        add_candidate("PIPE", pipe_parts[0], pipe_parts[1], 0.8)

    slash_parts = re.split(r"\s*/\s*", text)
    if len(slash_parts) == 2:
        add_candidate("SLASH", slash_parts[0], slash_parts[1], 0.65)

    if "_" in text and text.count("_") <= 3:
        under_parts = re.split(r"\s*_\s*", text)
        if len(under_parts) == 2:
            add_candidate("UNDERSCORE", under_parts[0], under_parts[1], 0.65)

    if not candidates:
        return None, text, None, 0.0, warnings

    candidates.sort(key=lambda c: c[3], reverse=True)
    best = candidates[0]
    if len(candidates) > 1 and abs(candidates[0][3] - candidates[1][3]) < 0.1:
        warnings.append("ambiguous_split")
        best = (best[0], best[1], best[2], min(best[3], 0.6))

    left_tokens = TOKEN_PATTERN.findall(best[0])
    right_tokens = TOKEN_PATTERN.findall(best[1])
    left_has_connector = bool(re.search(r"(?i)\b(and|x)\b|[&与]", best[0]))
    right_has_feat = bool(FEAT_PATTERN.search(best[1]))
    if (
        abs(len(left_tokens) - len(right_tokens)) <= 1
        and max(len(left_tokens), len(right_tokens)) <= 3
        and not left_has_connector
        and not right_has_feat
    ):
        if "ambiguous_split" not in warnings:
            warnings.append("ambiguous_split")
        best = (best[0], best[1], best[2], min(best[3], 0.6))
    return best[0], best[1], best[2], best[3], warnings


def clean_title(
    raw_title: str,
    raw_artist: Optional[str] = None,
    duration_seconds: Optional[float] = None,
    source: str = "user_text",
    lexicon: Lexicon = DEFAULT_LEXICON,
) -> TitleCleanResult:
    normalized_title = _normalize_title(raw_title, lexicon)
    removed_segments: List[str] = []
    removed_tokens: List[str] = []
    processing_removed_segments: List[str] = []
    processing_removed_tokens: List[str] = []
    warnings: List[str] = []
    featured_artists: List[str] = []
    derivative_hits: List[str] = []

    working = normalized_title
    working, bracket_hits = _strip_bracket_segments(
        working, lexicon, removed_segments, removed_tokens, featured_artists
    )
    derivative_hits.extend(bracket_hits)

    working, tail_hits = _tail_cut(working, lexicon, removed_segments, removed_tokens)
    derivative_hits.extend(tail_hits)

    working = _strip_noise_segments(working, lexicon, removed_segments, removed_tokens)
    working = re.sub(r"\s+", " ", working).strip()
    working = _strip_processing_tags(
        working, lexicon, processing_removed_segments, processing_removed_tokens, warnings
    )
    working = re.sub(r"\s+", " ", working).strip()

    main_artist: Optional[str] = None
    split_strategy: Optional[str] = None
    split_confidence: float = 0.0
    title_part = working

    if raw_artist and len(raw_artist.strip()) >= 2:
        main_artist = _clean_artist_name(raw_artist, lexicon)
        split_strategy = "RAW_ARTIST"
        split_confidence = 0.95
        if raw_artist:
            feat_from_artist = _extract_feat_from_segment(raw_artist)
            _unique_extend(featured_artists, feat_from_artist)
    else:
        artist_guess, title_guess, strategy, confidence, split_warnings = _split_artist_title(
            working
        )
        if artist_guess and strategy:
            main_artist = _clean_artist_name(artist_guess, lexicon)
            title_part = title_guess
            split_strategy = strategy
            split_confidence = confidence
            warnings.extend(split_warnings)
            if artist_guess:
                feat_from_artist = _extract_feat_from_segment(artist_guess)
                _unique_extend(featured_artists, feat_from_artist)
        else:
            split_strategy = "NONE"

    if main_artist:
        main_artist = _strip_feat_from_artist(main_artist)

    feat_from_title = _extract_feat_from_segment(title_part)
    _unique_extend(featured_artists, feat_from_title)

    base_title = title_part.strip()
    base_title = re.sub(r"\s+", " ", base_title).strip()
    base_title = re.sub(r"^[\-_/|]+", "", base_title).strip()
    base_title = re.sub(r"[\-_/|]+$", "", base_title).strip()

    if not base_title:
        warnings.append("cleaned_title_empty")
        base_title = normalized_title
    if len(base_title) < 2:
        warnings.append("title_too_short")
        if len(normalized_title) >= 2:
            base_title = normalized_title

    derivative_type = _choose_derivative_type(lexicon, derivative_hits)
    is_derivative = bool(derivative_hits)

    is_processing_noise = False
    _, remaining_processing_matches = _processing_tokens_in_text(base_title, lexicon)
    if processing_removed_tokens or processing_removed_segments or remaining_processing_matches:
        is_processing_noise = True

    if any(token in lexicon.noise_phrases for token in removed_tokens):
        warnings.append("noise_stripped")

    if main_artist and len(main_artist) < 2:
        warnings.append("artist_too_short")
        main_artist = None

    title_quality, quality_reasons, split_confidence = _assess_title_quality(
        normalized_title,
        base_title,
        processing_removed_tokens,
        lexicon,
        warnings,
        split_confidence,
    )
    if title_quality == "NOT_A_SONG_TITLE":
        base_title = _normalize_title(normalized_title, lexicon)
        split_strategy = "NONE"
        main_artist = None

    return TitleCleanResult(
        raw_title=raw_title,
        raw_artist=raw_artist,
        source=source,
        normalized_title=normalized_title,
        base_title=base_title,
        main_artist=main_artist,
        featured_artists=_dedupe_artists(featured_artists),
        is_derivative=is_derivative,
        derivative_type=derivative_type,
        is_processing_noise=is_processing_noise,
        processing_removed_tokens=processing_removed_tokens,
        processing_removed_segments=processing_removed_segments,
        title_quality=title_quality,
        quality_reasons=quality_reasons,
        removed_segments=removed_segments,
        removed_tokens=removed_tokens,
        split_strategy=split_strategy,
        split_confidence=split_confidence,
        warnings=warnings,
    )


def result_to_dict(result: TitleCleanResult) -> dict:
    return asdict(result)
