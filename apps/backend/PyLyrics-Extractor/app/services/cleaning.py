from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from typing import List, Optional, Tuple


VERSION_TOKENS = (
    "remix",
    "edit",
    "rework",
    "bootleg",
    "vip",
    "flip",
    "mashup",
    "mash up",
    "extended",
    "intro",
    "outro",
    "radio edit",
    "instrumental",
    "live",
    "acoustic",
    "mix",
    "version",
    "混音",
    "改编",
    "dj版",
    "串烧",
    "现场",
    "翻唱",
    "伴奏",
    "纯音乐",
    "加长",
    "intro版",
)

FEAT_PATTERN = re.compile(r"(?i)\b(feat\.?|ft\.?|featuring|with|x)\b")
CAMLOT_KEY_RE = re.compile(r"\b(1[0-2]|[1-9])[ab]\b", re.IGNORECASE)
BPM_TOKEN_RE = re.compile(
    r"\b(?:bpm)?(60|6[1-9]|7[0-9]|8[0-9]|9[0-9]|1[0-9]{2}|200)(?:bpm)?\b"
)
DJ_BRACKET_RE = re.compile(r"[\[(]([^\[\]()]*)[\])]")

DJ_EDIT_KEYWORDS = (
    "intro",
    "extended",
    "edit",
    "clean",
    "dirty",
    "club",
    "mix",
    "layered",
    "aligned",
    "structural",
    "bootleg",
    "dj edit",
    "transition",
    "tool",
    "acapella",
    "instrumental",
    "re-drum",
    "redrum",
    "加长",
    "前奏",
    "混音",
    "清洁",
    "脏版",
    "俱乐部",
    "分层",
    "对齐",
    "结构",
    "盗版",
    "过渡",
    "工具",
    "人声",
    "伴奏",
    "reggaeton",
    "moombahton",
    "baile",
    "jersey",
)

DJ_TAG_TOKENS = (
    "dirty",
    "clean",
    "intro",
    "extended",
    "club",
    "radio",
    "vip",
    "edit",
    "bootleg",
    "mix",
    "transition",
    "tool",
    "acapella",
    "instrumental",
    "re-drum",
    "redrum",
    "reggaeton",
    "moombahton",
    "baile",
    "jersey",
)
BRACKET_PAIRS = {"(": ")", "[": "]", "{": "}", "（": "）", "【": "】"}
BRACKET_OPENERS = set(BRACKET_PAIRS.keys())
BRACKET_CLOSERS = set(BRACKET_PAIRS.values())


@dataclass
class CleanResult:
    clean_title: str
    clean_artist: str
    query_title: str
    query_artist: str
    version_tokens: List[str]
    feat_artists: List[str]
    stripped_dj_tags: List[str]


def normalize_basic(text: str) -> str:
    if not text:
        return ""
    text = unicodedata.normalize("NFKC", text)
    text = text.replace("–", "-").replace("—", "-")
    text = re.sub(r"[\t\r\n]+", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def strip_specials(text: str) -> str:
    if not text:
        return ""
    allowed = re.sub(r"[^0-9A-Za-z\u4e00-\u9fff\s\-_/|&()\[\].'’]", " ", text)
    allowed = re.sub(r"\s+", " ", allowed).strip()
    return allowed


def normalize_query_text(text: str) -> str:
    text = normalize_basic(text).lower()
    text = text.replace("&", " and ")
    text = strip_specials(text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def normalize_similarity_text(text: str) -> str:
    text = normalize_query_text(text)
    text = text.replace(" ", "")
    return text


def _contains_cjk(text: str) -> bool:
    return any("\u4e00" <= ch <= "\u9fff" for ch in text)


def _build_keyword_patterns(tokens: Tuple[str, ...]) -> List[Tuple[str, Optional[re.Pattern]]]:
    patterns: List[Tuple[str, Optional[re.Pattern]]] = []
    for token in tokens:
        if _contains_cjk(token):
            patterns.append((token, None))
            continue
        normalized = re.sub(r"[^\w\s]+", " ", token.lower()).strip()
        if not normalized:
            patterns.append((token, None))
            continue
        parts = normalized.split()
        pattern = r"(?<!\w)" + r"\s+".join(map(re.escape, parts)) + r"(?!\w)"
        patterns.append((token, re.compile(pattern, re.IGNORECASE)))
    return patterns


VERSION_PATTERNS = _build_keyword_patterns(VERSION_TOKENS)
DJ_EDIT_PATTERNS = _build_keyword_patterns(DJ_EDIT_KEYWORDS)
BRACKET_REMOVE_PHRASES = (
    "trap break",
)
BRACKET_REMOVE_PATTERNS = _build_keyword_patterns(BRACKET_REMOVE_PHRASES)


def detect_version_tokens(text: str) -> List[str]:
    normalized = normalize_query_text(text)
    lowered = text.lower()
    hits: List[str] = []
    for token, pattern in VERSION_PATTERNS:
        if pattern is None:
            if token.lower() in lowered:
                hits.append(token)
            continue
        if pattern.search(normalized):
            hits.append(token)
    return hits


def is_dj_edit_mode(raw_title: str, clean_title: str, filename: str) -> bool:
    combined = " ".join([raw_title or "", clean_title or "", filename or ""]).strip()
    if not combined:
        return False
    normalized = normalize_query_text(combined)
    lowered = combined.lower()
    for token, pattern in DJ_EDIT_PATTERNS:
        if pattern is None:
            if token in lowered:
                return True
            continue
        if pattern.search(normalized):
            return True
    return False


def _append_unique(tags: List[str], value: str) -> None:
    if value and value not in tags:
        tags.append(value)


def _is_bpm_token(token: str) -> bool:
    match = BPM_TOKEN_RE.fullmatch(token.lower())
    if not match:
        return False
    try:
        value = int(match.group(1))
    except ValueError:
        return False
    return 60 <= value <= 200


def _is_dj_tag(token: str) -> bool:
    token = token.lower()
    if not token:
        return False
    if token in DJ_TAG_TOKENS:
        return True
    if CAMLOT_KEY_RE.fullmatch(token):
        return True
    if _is_bpm_token(token):
        return True
    return False


def _bracket_looks_like_dj_meta(content: str) -> bool:
    normalized = normalize_query_text(content)
    if not normalized:
        return False
    if CAMLOT_KEY_RE.search(normalized):
        return True
    if BPM_TOKEN_RE.search(normalized):
        return True
    for token, pattern in DJ_EDIT_PATTERNS:
        if pattern is None:
            if token.lower() in normalized:
                return True
            continue
        if pattern.search(normalized):
            return True
    for token, pattern in BRACKET_REMOVE_PATTERNS:
        if pattern is None:
            if token.lower() in normalized:
                return True
            continue
        if pattern.search(normalized):
            return True
    return False


def strip_dj_tags(text: str) -> Tuple[str, List[str]]:
    normalized = normalize_query_text(text)
    tags: List[str] = []

    def strip_bracket(match: re.Match) -> str:
        content = match.group(1).strip()
        if not content:
            return match.group(0)
        tokens = content.split()
        if any(_is_dj_tag(token) for token in tokens) or _bracket_looks_like_dj_meta(content):
            for token in tokens:
                if _is_dj_tag(token):
                    _append_unique(tags, token.lower())
            return " "
        return match.group(0)

    normalized = DJ_BRACKET_RE.sub(strip_bracket, normalized)

    kept: List[str] = []
    for token in normalized.split():
        if _is_dj_tag(token):
            _append_unique(tags, token.lower())
        else:
            kept.append(token)

    cleaned = " ".join(kept).strip()
    return cleaned, tags


def extract_bracket_segments(text: str) -> List[Tuple[int, int, str]]:
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


def remove_brackets_with_version(title: str, version_tokens: List[str]) -> str:
    segments = extract_bracket_segments(title)
    removal_spans: List[Tuple[int, int]] = []
    for start, end, content in segments:
        hits = detect_version_tokens(content)
        if hits:
            removal_spans.append((start, end))
            for hit in hits:
                if hit not in version_tokens:
                    version_tokens.append(hit)
    if not removal_spans:
        return title
    cleaned = title
    for start, end in sorted(removal_spans, key=lambda x: x[0], reverse=True):
        cleaned = cleaned[:start] + cleaned[end + 1 :]
    return re.sub(r"\s+", " ", cleaned).strip()


def remove_tail_version(title: str, version_tokens: List[str]) -> str:
    tokens = re.split(r"\s+", title.strip())
    if not tokens:
        return title
    joined = " ".join(tokens)
    normalized = normalize_query_text(joined)
    normalized_tokens = normalized.split()
    tail = normalized_tokens[-5:] if len(normalized_tokens) >= 5 else normalized_tokens
    tail_text = " ".join(tail)
    hits = detect_version_tokens(tail_text)
    if not hits:
        return title
    for hit in hits:
        if hit not in version_tokens:
            version_tokens.append(hit)
    pattern = re.compile(r"(?i)\b(" + "|".join(re.escape(hit) for hit in hits) + r")\b")
    match = None
    for idx, token in enumerate(tokens):
        if pattern.search(token.lower()):
            match = idx
            break
    if match is None:
        return title
    trimmed = " ".join(tokens[:match]).strip()
    return trimmed


def extract_feat_artists(text: str) -> List[str]:
    matches = list(FEAT_PATTERN.finditer(text))
    if not matches:
        return []
    artists: List[str] = []
    for match in matches:
        tail = text[match.end() :].strip()
        if not tail:
            continue
        stop = len(tail)
        for stopper in (")", "]", "}", "-", "|", "/"):
            pos = tail.find(stopper)
            if pos != -1:
                stop = min(stop, pos)
        chunk = tail[:stop].strip(" .:-_[](){}<>")
        parts = re.split(r"\s*(?:,|&|\+|x|X|and|与|、)\s*", chunk)
        for part in parts:
            cleaned = part.strip(" .")
            if cleaned and cleaned not in artists:
                artists.append(cleaned)
    return artists


def remove_feat(text: str) -> str:
    return re.sub(r"(?i)\s*\(?\b(feat\.?|ft\.?|featuring|with|x)\b.*$", "", text).strip()


def strip_version_tokens_from_query(text: str, version_tokens: List[str]) -> str:
    normalized = normalize_query_text(text)
    cleaned = normalized
    for token, pattern in VERSION_PATTERNS:
        if pattern is None:
            lowered = token.lower()
            if lowered in cleaned:
                cleaned = cleaned.replace(lowered, " ")
                if token not in version_tokens:
                    version_tokens.append(token)
            continue
        if pattern.search(cleaned):
            cleaned = pattern.sub(" ", cleaned)
            if token not in version_tokens:
                version_tokens.append(token)
    return re.sub(r"\s+", " ", cleaned).strip()


def _reduce_mashup_vs_title(query_title: str, version_tokens: List[str]) -> str:
    if not query_title:
        return query_title
    if not version_tokens:
        return query_title
    version_lower = {token.lower() for token in version_tokens}
    if not {"mashup", "bootleg", "blend"}.intersection(version_lower):
        return query_title
    if not re.search(r"\bvs\.?\b", query_title):
        return query_title
    segments = [seg.strip() for seg in re.split(r"\bvs\.?\b", query_title) if seg.strip()]
    if not segments:
        return query_title

    def seg_score(seg: str) -> int:
        return len(seg.replace(" ", ""))

    return max(segments, key=seg_score)


def split_artist_title(text: str) -> Tuple[Optional[str], Optional[str], float]:
    candidates: List[Tuple[str, str, float]] = []
    def add_candidates(parts: List[str], base: float) -> None:
        if len(parts) < 2:
            return
        left = parts[0]
        right = " ".join(parts[1:])
        candidates.append((left, right, base))
        left_alt = " ".join(parts[:-1])
        right_alt = parts[-1]
        candidates.append((left_alt, right_alt, base - 0.1))

    split_specs = [
        (r"\s*-\s*", 0.8),               # hyphen
        (r"\s*[–—－]\s*", 0.78),          # en/em dash, fullwidth dash
        (r"\s*[:：]\s*", 0.72),           # colon
        (r"\s*\|\s*", 0.75),             # pipe
        (r"\s*[/／]\s*", 0.6),            # slash
        (r"\s*[·•]\s*", 0.6),            # middle dot / bullet
        (r"\s*[~〜～]\s*", 0.58),         # tilde
    ]

    for pattern, base in split_specs:
        parts = re.split(pattern, text)
        add_candidates(parts, base)

    if "_" in text and text.count("_") <= 3:
        under_parts = re.split(r"\s*_\s*", text)
        add_candidates(under_parts, 0.6)

    if not candidates:
        return None, None, 0.0

    def artist_likely_score(artist: str, title: str, base: float) -> float:
        score = base
        if re.search(r"(?i)\b(feat|ft|x|&|and)\b", artist):
            score += 0.1
        if len(artist) <= len(title):
            score += 0.05
        if re.search(r"(?i)\b(official|现场|完整版)\b", artist):
            score -= 0.15
        return max(0.0, min(1.0, score))

    candidates = [
        (a.strip(), b.strip(), artist_likely_score(a, b, base)) for a, b, base in candidates
    ]
    candidates.sort(key=lambda item: item[2], reverse=True)
    return candidates[0]


def clean_track(raw_title: str, raw_artist: Optional[str]) -> CleanResult:
    title = strip_specials(normalize_basic(raw_title))
    artist = strip_specials(normalize_basic(raw_artist or ""))

    version_tokens: List[str] = []
    title = remove_brackets_with_version(title, version_tokens)
    title = remove_tail_version(title, version_tokens)
    title = re.sub(r"\s+", " ", title).strip()

    feat_artists = extract_feat_artists(title)

    clean_title = title
    clean_artist = artist

    title_seed = remove_feat(clean_title)
    title_seed, tags_title = strip_dj_tags(title_seed)
    artist_seed, tags_artist = strip_dj_tags(clean_artist)
    stripped_tags: List[str] = []
    for tag in tags_title + tags_artist:
        _append_unique(stripped_tags, tag)

    query_title = strip_version_tokens_from_query(title_seed, version_tokens)
    query_title = _reduce_mashup_vs_title(query_title, version_tokens)
    query_artist = normalize_query_text(artist_seed)

    return CleanResult(
        clean_title=clean_title,
        clean_artist=clean_artist,
        query_title=query_title,
        query_artist=query_artist,
        version_tokens=version_tokens,
        feat_artists=feat_artists,
        stripped_dj_tags=stripped_tags,
    )
