import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.services.scoring import compute_heat_score


SAMPLES = [
    {
        "name": "club_cn_hiphop_fresh_7d",
        "metrics": {
            "play_count": 0,
            "comment_count": 400,
            "liked_count": 0,
            "share_count": 0,
            "_popularity": 85,
            "_raw_title": "Song Remix",
            "_cleaned_title": "song remix",
        },
        "publish_offset_days": 7,
    },
    {
        "name": "club_cn_hiphop_fresh_150d",
        "metrics": {
            "play_count": 0,
            "comment_count": 180,
            "liked_count": 0,
            "share_count": 0,
            "_popularity": 70,
        },
        "publish_offset_days": 150,
    },
    {
        "name": "club_cn_hiphop_old_181d",
        "metrics": {
            "play_count": 0,
            "comment_count": 180,
            "liked_count": 0,
            "share_count": 0,
            "_popularity": 70,
        },
        "publish_offset_days": 181,
    },
    {
        "name": "classic_old",
        "metrics": {
            "play_count": 0,
            "comment_count": 2000,
            "liked_count": 0,
            "share_count": 0,
            "_popularity": 95,
        },
        "publish_offset_days": 700,
    },
    {
        "name": "low_track",
        "metrics": {
            "play_count": 0,
            "comment_count": 3,
            "liked_count": 0,
            "share_count": 0,
            "_popularity": 10,
        },
        "publish_offset_days": 30,
    },
]


def main() -> None:
    now_ts = int(time.time() * 1000)
    for sample in SAMPLES:
        metrics = dict(sample["metrics"])
        if "publish_offset_days" in sample:
            metrics["publish_time"] = now_ts - sample["publish_offset_days"] * 86400 * 1000
        result = compute_heat_score(metrics, now_ts=now_ts, debug=True)
        output = {
            "name": sample["name"],
            "heat": {
                "heat_score": result["heat_score"],
                "heat_score_raw": result["heat_score_raw"],
                "heat_level": result["heat_level"],
                "heat_label": result["heat_label"],
                "heat_badge": result["heat_badge"],
            },
            "mode": result["breakdown"].get("mode"),
            "fresh_factor_v2": result["breakdown"].get("v2", {}).get("fresh_factor"),
            "w_momentum_v2": result["breakdown"].get("v2", {}).get("w_momentum"),
            "new_song_floor": result["breakdown"].get("v2", {}).get("new_song_floor"),
        }
        print(json.dumps(output, ensure_ascii=False))


if __name__ == "__main__":
    main()
