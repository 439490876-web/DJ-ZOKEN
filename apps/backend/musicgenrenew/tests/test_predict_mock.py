import numpy as np

from app.model.infer import threshold_predictions, top_k_predictions
from app.model.labels import LabelInfo


def test_postprocess_topk_stable_order():
    labels = [
        LabelInfo(style="StyleA", genre="GenreA", raw="GenreA---StyleA"),
        LabelInfo(style="StyleB", genre="GenreB", raw="GenreB---StyleB"),
        LabelInfo(style="StyleC", genre="GenreC", raw="GenreC---StyleC"),
    ]
    probs = np.array([0.5, 0.5, 0.4], dtype=np.float32)
    preds = top_k_predictions(probs, labels, top_k=2)
    assert [pred.style for pred in preds] == ["StyleA", "StyleB"]
    assert all(0.0 <= pred.prob <= 1.0 for pred in preds)
    above = threshold_predictions(probs, labels, threshold=0.6)
    assert above == []


def test_postprocess_format():
    labels = [LabelInfo(style="StyleA", genre=None, raw="StyleA")]
    probs = np.array([0.9], dtype=np.float32)
    preds = top_k_predictions(probs, labels, top_k=1)
    assert preds[0].style == "StyleA"
    assert preds[0].genre is None
