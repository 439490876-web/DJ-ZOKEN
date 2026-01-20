from app.services.key_utils import camelot_to_key_text, key_to_camelot, parse_key_tag


def test_parse_key_tag_camelot():
    key_text, camelot = parse_key_tag("8A")
    assert camelot == "8A"
    assert key_text == "A minor"


def test_parse_key_tag_text():
    key_text, camelot = parse_key_tag("C# minor")
    assert camelot == "12A"
    assert key_text == "C# minor"


def test_key_to_camelot_major():
    assert key_to_camelot("F", "major") == "7B"


def test_camelot_to_key_text():
    assert camelot_to_key_text("11B") == "A major"
