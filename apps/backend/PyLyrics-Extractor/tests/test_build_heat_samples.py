import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[4]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

import types

# Stub requests to avoid dependency requirement in test environment.
if "requests" not in sys.modules:
    class _DummyRequests:
        class RequestException(Exception):
            pass

        def get(self, *args, **kwargs):
            raise self.RequestException("requests disabled in tests")

    sys.modules["requests"] = _DummyRequests()

import scripts.build_heat_samples_from_audio as builder


def test_score_candidate_prefers_title_artist_match():
    sample = {
        "clean_title": "pepas",
        "clean_artist": "farruko",
        "duration": 200.0,
    }
    candidate = {
        "id": "123",
        "name": "Pepas",
        "artists": ["Farruko"],
        "duration": 200000,
    }
    score = builder.score_candidate(sample, candidate)
    assert score >= 80


def test_flatten_candidates_expands_columns():
    candidates = [
        {"id": "1", "name": "A", "artists": ["X"], "duration": 100000, "score": 88},
        {"id": "2", "name": "B", "artists": ["Y"], "duration": 120000, "score": 70},
    ]
    row = builder.flatten_candidates(candidates, max_candidates=5)
    assert row["cand1_id"] == "1"
    assert row["cand1_name"] == "A"
    assert row["cand1_artist"] == "X"
    assert row["cand1_duration"] == 100000
    assert row["cand1_score"] == 88
    assert row.get("cand5_id", "") in ("", None)


def test_build_samples_smoke(monkeypatch, tmp_path):
    audio = tmp_path / "Farruko - Pepas.mp3"
    audio.write_bytes(b"dummy")

    class DummyInfo:
        length = 200.0

    class DummyTag:
        tags = {"title": ["Pepas"], "artist": ["Farruko"]}
        info = DummyInfo()

    class DummyMutagen:
        @staticmethod
        def File(path, easy=True):
            return DummyTag()

    class DummyResponse:
        status_code = 200

        def json(self):
            return {
                "result": {
                    "songs": [
                        {
                            "id": 123,
                            "name": "Pepas",
                            "artists": [{"name": "Farruko"}],
                            "duration": 200000,
                        }
                    ]
                }
            }

    class DummyRequests:
        RequestException = Exception

        @staticmethod
        def get(url, params=None, timeout=None):
            return DummyResponse()

    monkeypatch.setattr(builder, "mutagen", DummyMutagen)
    monkeypatch.setattr(builder, "requests", DummyRequests)

    samples, review_rows, unmatched_rows = builder.build_samples(
        audio_dir=tmp_path,
        min_score=70,
        limit=None,
    )

    assert len(samples) == 1
    assert samples[0]["track_id"] == "123"
    assert len(review_rows) == 1
    assert review_rows[0]["cand1_id"] == "123"
    assert len(unmatched_rows) == 0


def test_enrich_detail_adds_fields(monkeypatch, tmp_path):
    audio = tmp_path / "Farruko - Pepas.mp3"
    audio.write_bytes(b"dummy")

    class DummyInfo:
        length = 200.0

    class DummyTag:
        tags = {"title": ["Pepas"], "artist": ["Farruko"]}
        info = DummyInfo()

    class DummyMutagen:
        @staticmethod
        def File(path, easy=True):
            return DummyTag()

    class DummyResponse:
        status_code = 200

        def json(self):
            return {
                "result": {
                    "songs": [
                        {
                            "id": 123,
                            "name": "Pepas",
                            "artists": [{"name": "Farruko"}],
                            "duration": 200000,
                        }
                    ]
                }
            }

    class DummyRequests:
        RequestException = Exception

        @staticmethod
        def get(url, params=None, timeout=None):
            return DummyResponse()

    class DummyClient:
        def fetch_track_detail_with_meta(self, track_id):
            return {
                "ok": True,
                "track_id": track_id,
                "popularity": 88,
                "comment_count": 12,
                "publish_time": 1700000000000,
                "raw_source": "dummy",
                "popularity_source": "popularity",
                "comment_source": "comment_count",
            }

    monkeypatch.setattr(builder, "mutagen", DummyMutagen)
    monkeypatch.setattr(builder, "requests", DummyRequests)
    monkeypatch.setattr(builder, "NeteaseEnhancedClient", lambda: DummyClient())

    samples, _, _ = builder.build_samples(
        audio_dir=tmp_path,
        min_score=70,
        limit=None,
        enrich_detail=True,
        detail_limit_rate=5,
    )

    assert samples[0]["popularity"] == 88
    assert samples[0]["comment_count"] == 12
    assert samples[0]["publish_time"] == 1700000000000
    assert samples[0]["detail_ok"] == 1


def test_enrich_detail_normalizes_publish_time(monkeypatch, tmp_path):
    audio = tmp_path / "Farruko - Pepas.mp3"
    audio.write_bytes(b"dummy")

    class DummyInfo:
        length = 200.0

    class DummyTag:
        tags = {"title": ["Pepas"], "artist": ["Farruko"]}
        info = DummyInfo()

    class DummyMutagen:
        @staticmethod
        def File(path, easy=True):
            return DummyTag()

    class DummyResponse:
        status_code = 200

        def json(self):
            return {
                "result": {
                    "songs": [
                        {
                            "id": 123,
                            "name": "Pepas",
                            "artists": [{"name": "Farruko"}],
                            "duration": 200000,
                        }
                    ]
                }
            }

    class DummyRequests:
        RequestException = Exception

        @staticmethod
        def get(url, params=None, timeout=None):
            return DummyResponse()

    class DummyClient:
        def fetch_track_detail_with_meta(self, track_id):
            return {
                "ok": True,
                "track_id": track_id,
                "popularity": 88,
                "comment_count": 12,
                "publish_time": 1700000000000000,
                "raw_source": "dummy",
                "popularity_source": "popularity",
                "comment_source": "comment_count",
            }

    monkeypatch.setattr(builder, "mutagen", DummyMutagen)
    monkeypatch.setattr(builder, "requests", DummyRequests)
    monkeypatch.setattr(builder, "NeteaseEnhancedClient", lambda: DummyClient())

    samples, _, _ = builder.build_samples(
        audio_dir=tmp_path,
        min_score=70,
        limit=None,
        enrich_detail=True,
        detail_limit_rate=5,
    )

    assert samples[0]["publish_time"] < 2000000000000
