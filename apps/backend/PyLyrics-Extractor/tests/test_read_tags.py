from pathlib import Path

from app.services import identify as identify_module



def test_read_tags_returns_tuple():
    sample = Path(
        "/Users/apple/work/NEWSETki/apps/backend/newenergy/vibenet/sample.wav"
    )
    assert sample.exists()

    title, artist, isrc = identify_module._read_tags(str(sample))
    assert isinstance(title, (str, type(None)))
    assert isinstance(artist, (str, type(None)))
    assert isinstance(isrc, (str, type(None)))
