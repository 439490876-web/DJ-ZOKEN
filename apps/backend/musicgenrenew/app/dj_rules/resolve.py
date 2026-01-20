from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

from ..config import get_settings
from ..model.infer import Prediction
from ..segment.strategy import choose_segment_strategy
from .constants import BLACKHOLE_STYLES, EDM_FAMILY, LATIN_HINT_STYLES, TRAP_FAMILY, normalize_style


@dataclass
class DJResolution:
    dj_style: str
    dj_confidence: float
    dj_reason: List[str]
    reranked_top_styles: Optional[List[Prediction]]
    segment_strategy_used: str
    hit_rules: List[str]
    suggested_segment_strategy: str


def _style_in_set(value: str, styles: set[str]) -> bool:
    value_norm = normalize_style(value)
    for item in styles:
        if value_norm == normalize_style(item):
            return True
    return False


def _style_prob_map(preds: List[Prediction]) -> Dict[str, float]:
    out: Dict[str, float] = {}
    for pred in preds:
        if pred.style:
            out[pred.style] = float(pred.prob)
    return out


def _top_gap(preds: List[Prediction]) -> float:
    if len(preds) < 2:
        return 1.0
    return float(preds[0].prob) - float(preds[1].prob)


def _clamp(value: float, min_value: float, max_value: float) -> float:
    return max(min_value, min(max_value, value))


def _rerank_styles(
    preds: List[Prediction],
    suppress: set[str],
    suppress_multiplier: float,
    boost: set[str],
    boost_amount: float,
) -> List[Prediction]:
    updated = []
    for pred in preds:
        prob = float(pred.prob)
        if _style_in_set(pred.style, suppress):
            prob *= suppress_multiplier
        if _style_in_set(pred.style, boost):
            prob += boost_amount
        updated.append(Prediction(style=pred.style, prob=prob, genre=pred.genre))
    updated.sort(key=lambda item: (-item.prob, item.style))
    return updated


def _map_discogs_to_dj(style: str) -> str:
    if _style_in_set(style, LATIN_HINT_STYLES):
        return "Latin / Global"
    if _style_in_set(style, TRAP_FAMILY):
        return "Hip Hop / Trap"
    if _style_in_set(style, EDM_FAMILY):
        return "EDM / Club"
    if "pop" in style.lower():
        return "Pop / Dance"
    if "rock" in style.lower():
        return "Rock / Alt"
    return style or "Other"


def resolve_dj_style(
    top_styles: List[Prediction],
    segment_info: Dict,
    bpm_estimate: Optional[float] = None,
    extra_candidates: Optional[List[Prediction]] = None,
) -> DJResolution:
    settings = get_settings()

    preds = top_styles or []
    extra = extra_candidates or preds
    prob_map = _style_prob_map(extra)
    dj_reason: List[str] = []
    hit_rules: List[str] = []

    segment_strategy_used = segment_info.get("strategy", "energy")
    suggested_strategy = choose_segment_strategy(preds, extra_candidates=extra, maybe_bpm=bpm_estimate)
    if suggested_strategy != segment_strategy_used:
        dj_reason.append(f"suggested_segment_strategy={suggested_strategy} (not implemented)")

    top1 = preds[0] if preds else None
    top2 = preds[1] if len(preds) > 1 else None
    top3 = preds[2] if len(preds) > 2 else None

    has_blackhole = any(_style_in_set(pred.style, BLACKHOLE_STYLES) for pred in preds[:2])
    latin_hint_present = any(_style_in_set(pred.style, LATIN_HINT_STYLES) for pred in extra)
    trap_family_top3 = all(_style_in_set(pred.style, TRAP_FAMILY) for pred in preds[:3]) if len(preds) >= 3 else False
    uncertain_gap = _top_gap(preds) <= settings.dj_uncertain_gap_max
    latin_override_trigger = (has_blackhole and latin_hint_present) or (trap_family_top3 and uncertain_gap)

    # Latin / Baile override
    if latin_override_trigger:
        latin_sum = 0.0
        for style in LATIN_HINT_STYLES:
            latin_sum += prob_map.get(style, 0.0)
        latin_score = latin_sum * settings.dj_latin_score_multiplier
        latin_score += prob_map.get("Reggaeton", 0.0) * settings.dj_latin_score_reggaeton
        latin_score += prob_map.get("Latin", 0.0) * settings.dj_latin_score_latin
        latin_score += prob_map.get("MPB", 0.0) * settings.dj_latin_score_mpb

        grime_crunk_score = prob_map.get("Grime", 0.0) + prob_map.get("Crunk", 0.0)
        if latin_score >= max(settings.dj_latin_override_min, grime_crunk_score * settings.dj_latin_override_ratio):
            dj_style = "Latin Urban / Baile Funk"
            dj_confidence = _clamp(
                settings.dj_latin_conf_base + latin_score * settings.dj_latin_conf_scale,
                0.0,
                settings.dj_latin_conf_max,
            )
            dj_reason.append("override: Grime/Crunk suppressed by Latin hints")
            dj_reason.append(f"latin_score={latin_score:.3f} grime_crunk_score={grime_crunk_score:.3f}")
            hit_rules.append("latin_override")
            reranked = _rerank_styles(
                preds,
                suppress=BLACKHOLE_STYLES,
                suppress_multiplier=settings.dj_rerank_suppress_mult,
                boost=LATIN_HINT_STYLES,
                boost_amount=settings.dj_rerank_latin_boost,
            )
            if top1 and _style_in_set(top1.style, BLACKHOLE_STYLES):
                dj_reason.append("recommend_multi_segment_vote=true segments=[(45,65),(75,95),(105,125)]")
            return DJResolution(
                dj_style=dj_style,
                dj_confidence=dj_confidence,
                dj_reason=dj_reason,
                reranked_top_styles=reranked,
                segment_strategy_used=segment_strategy_used,
                hit_rules=hit_rules,
                suggested_segment_strategy=suggested_strategy,
            )

    # Trap mid-tempo
    if any(_style_in_set(pred.style, {"Trap"}) for pred in preds[:3]):
        if bpm_estimate is None:
            dj_reason.append("bpm_missing: skip tempo-aware trap rule")
        else:
            bpm = float(bpm_estimate)
            in_band = settings.dj_trap_bpm_min <= bpm <= settings.dj_trap_bpm_max
            in_double = settings.dj_trap_double_min <= bpm <= settings.dj_trap_double_max
            if in_band or in_double:
                trap_prob = prob_map.get("Trap", 0.0)
                dj_style = "Trap (Mid-tempo)"
                dj_confidence = _clamp(
                    settings.dj_trap_conf_base + settings.dj_trap_conf_scale * trap_prob,
                    0.0,
                    settings.dj_trap_conf_max,
                )
                dj_reason.append("tempo-aware: Trap promoted due to BPM in mid-tempo band")
                dj_reason.append(f"bpm={bpm_estimate}")
                hit_rules.append("trap_midtempo")
                max_prob = max((float(pred.prob) for pred in preds), default=0.0)
                boosted = []
                for pred in preds:
                    prob = float(pred.prob)
                    if _style_in_set(pred.style, {"Trap"}):
                        prob = max_prob + 0.001
                    boosted.append(Prediction(style=pred.style, prob=prob, genre=pred.genre))
                boosted.sort(key=lambda item: (-item.prob, item.style))
                return DJResolution(
                    dj_style=dj_style,
                    dj_confidence=dj_confidence,
                    dj_reason=dj_reason,
                    reranked_top_styles=boosted,
                    segment_strategy_used=segment_strategy_used,
                    hit_rules=hit_rules,
                    suggested_segment_strategy=suggested_strategy,
                )

    # Fallback
    fallback_style = top1.style if top1 else ""
    dj_style = _map_discogs_to_dj(fallback_style)
    dj_confidence = _clamp(
        settings.dj_fallback_conf_base + settings.dj_fallback_conf_scale * (float(top1.prob) if top1 else 0.0),
        0.0,
        settings.dj_fallback_conf_max,
    )
    dj_reason.append("fallback: top1 mapped")
    hit_rules.append("fallback")
    return DJResolution(
        dj_style=dj_style,
        dj_confidence=dj_confidence,
        dj_reason=dj_reason,
        reranked_top_styles=None,
        segment_strategy_used=segment_strategy_used,
        hit_rules=hit_rules,
        suggested_segment_strategy=suggested_strategy,
    )
