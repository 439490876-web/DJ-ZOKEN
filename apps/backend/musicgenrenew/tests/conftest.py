from dataclasses import replace

from app.config import get_settings, Settings


def build_settings(**overrides) -> Settings:
    return replace(get_settings(), **overrides)
