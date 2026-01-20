from app.util.filename import resolve_display_filename


def test_resolve_filename_original_name_priority():
    display, meta = resolve_display_filename("raw.mp3", "Nice Name.mp3")
    assert display == "Nice Name.mp3"
    assert meta["method"] == "original_name"
    assert meta["success"] is True


def test_resolve_filename_utf8_raw_kept():
    raw = "DJ OkeyDokey - 有点甜（DJ OkeyDokey remix）.flac"
    display, meta = resolve_display_filename(raw, None)
    assert display == raw
    assert meta["method"] == "utf8_from_raw"
    assert meta["success"] is True


def test_resolve_filename_latin1_to_utf8():
    original = "DJ OkeyDokey - 有点甜（DJ OkeyDokey remix）.flac"
    mangled = original.encode("utf-8").decode("latin-1")
    display, meta = resolve_display_filename(mangled, None)
    assert display == original
    assert meta["method"] == "latin1_to_utf8"
    assert meta["success"] is True
