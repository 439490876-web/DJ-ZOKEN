import sys


def check_python_version(version_info=None) -> int:
    version = version_info or sys.version_info
    print(f"Python version: {version.major}.{version.minor}.{version.micro}")

    if version >= (3, 13):
        print(
            "ERROR: Python 3.13 is not supported.\n"
            "Use one of:\n"
            "- Homebrew: brew install python@3.11\n"
            "- pyenv: pyenv install 3.11.9\n"
            "- Docker: docker build -t discogs-style-api .\n"
        )
        return 1

    if (version.major, version.minor) in {(3, 11), (3, 12)}:
        print("OK: Python 3.11/3.12 is supported.")
        return 0

    print("ERROR: Only Python 3.11/3.12 is supported.")
    return 1


def main() -> int:
    return check_python_version()


if __name__ == "__main__":
    raise SystemExit(main())
