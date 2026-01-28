import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[4]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

# Stub requests to avoid dependency requirement in test environment.
if "requests" not in sys.modules:
    class _DummyRequests:  # pragma: no cover - test shim
        class RequestException(Exception):
            pass

        def get(self, *args, **kwargs):
            raise self.RequestException("requests disabled in tests")

    sys.modules["requests"] = _DummyRequests()

from scripts.inspect_ncm_detail_fields import select_samples, popularity_100_ratio


def test_select_samples_top_score():
    samples = [
        {"track_id": "1", "match_score": 80, "detail_ok": 1},
        {"track_id": "2", "match_score": 90, "detail_ok": 1},
    ]
    selected = select_samples(samples, limit=1, mode="top-score", seed=7)
    assert selected[0]["track_id"] == "2"


def test_popularity_100_ratio():
    values = [100, 100, 90, None]
    ratio = popularity_100_ratio(values)
    assert ratio == 2 / 3
