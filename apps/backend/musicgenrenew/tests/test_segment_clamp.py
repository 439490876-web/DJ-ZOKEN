from app.segment.drop import clamp_drop_segment


def test_clamp_drop_segment_out_of_bounds():
    start, end, clamped = clamp_drop_segment(17.0, 191.0, 208.0, 20.0)
    assert clamped is True
    assert start == 0.0
    assert end == 17.0


def test_clamp_drop_segment_valid():
    start, end, clamped = clamp_drop_segment(30.0, 5.0, 25.0, 20.0)
    assert clamped is False
    assert start == 5.0
    assert end == 25.0
