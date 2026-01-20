from __future__ import annotations

import argparse
import json

from .cleaner import clean_title, result_to_dict


def main() -> None:
    parser = argparse.ArgumentParser(description="Clean and split song titles.")
    parser.add_argument("raw_title", help="Raw title text")
    parser.add_argument("--artist", dest="raw_artist", default=None, help="Raw artist text")
    parser.add_argument(
        "--source",
        default="user_text",
        choices=["id3", "filename", "user_text"],
        help="Input source",
    )
    args = parser.parse_args()

    result = clean_title(args.raw_title, raw_artist=args.raw_artist, source=args.source)
    print(json.dumps(result_to_dict(result), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
