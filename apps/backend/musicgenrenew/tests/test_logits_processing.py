import numpy as np

from app.model.infer import aggregate_patch_probs, sigmoid, threshold_predictions, top_k_predictions
from app.model.labels import LabelInfo


def test_sigmoid_topk_threshold_order():
    labels = [LabelInfo(style=f"Style{i}", genre=None, raw=f"Style{i}") for i in range(400)]
    logits = np.zeros((1, 400), dtype=np.float32)
    probs = sigmoid(logits)
    segment_probs = aggregate_patch_probs(probs)

    top = top_k_predictions(segment_probs, labels, top_k=5)
    above = threshold_predictions(segment_probs, labels, threshold=0.9)

    assert len(top) == 5
    assert above == []
    assert all(0.0 <= pred.prob <= 1.0 for pred in top)
