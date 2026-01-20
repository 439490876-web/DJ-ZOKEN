import numpy as np

from app.model.infer import aggregate_patch_probs, sigmoid, threshold_predictions, top_k_predictions
from app.model.labels import LabelInfo


def test_sigmoid_topk_threshold_behavior():
    labels = [LabelInfo(style=f"Style{i}", genre=None, raw=f"Style{i}") for i in range(400)]
    logits = np.linspace(-5.0, 5.0, num=400, dtype=np.float32).reshape(1, 400)
    probs = sigmoid(logits)
    segment_probs = aggregate_patch_probs(probs)

    assert segment_probs.min() > 0.0
    assert segment_probs.max() < 1.0

    top = top_k_predictions(segment_probs, labels, top_k=5)
    above = threshold_predictions(segment_probs, labels, threshold=0.99)

    assert len(top) == 5
    assert all(0.0 <= pred.prob <= 1.0 for pred in top)
    assert all(pred.prob >= top[-1].prob for pred in top)
    assert len(above) > 0
    assert all(pred.prob >= 0.99 for pred in above)
