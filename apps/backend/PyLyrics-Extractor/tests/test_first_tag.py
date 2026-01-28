from app.services import identify as identify_module


class ExplodingTags:
    def __init__(self, value):
        self._value = value

    def __contains__(self, key):
        raise ValueError('bad key')

    def get(self, key, default=None):
        if key in {"artist", "TPE1"}:
            return self._value
        return default


class ListTags:
    def get(self, key, default=None):
        if key == "artist":
            return ["ACME"]
        return default


class MissingTags:
    def get(self, key, default=None):
        return default



def test_first_tag_handles_value_error():
    tags = ExplodingTags("Artist")
    result = identify_module._first_tag(tags, ("TPE1", "artist"))
    assert result == "Artist"


def test_first_tag_handles_list_values():
    tags = ListTags()
    result = identify_module._first_tag(tags, ("artist",))
    assert result == "ACME"


def test_first_tag_returns_none_when_missing():
    tags = MissingTags()
    result = identify_module._first_tag(tags, ("artist",))
    assert result is None
