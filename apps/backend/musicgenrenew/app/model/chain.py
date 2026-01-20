from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Tuple

import numpy as np

from ..config import Settings


def resolve_head_enabled(settings: Settings, backbone_output_dim: int) -> Tuple[bool, str]:
    mode = settings.enable_classification_head
    expected = settings.head_expected_dim
    if mode == "true":
        return True, "forced_true"
    if mode == "false":
        return False, "forced_false"
    if backbone_output_dim != expected:
        return True, "auto_embedding"
    return False, "auto_direct"


@dataclass(frozen=True)
class ModelChain:
    backbone_session: object
    backbone_input_name: str
    backbone_output_dim: int
    head_session: Optional[object] = None
    head_input_name: Optional[str] = None
    head_output_dim: Optional[int] = None

    @property
    def head_enabled(self) -> bool:
        return self.head_session is not None

    def run(self, features: np.ndarray) -> np.ndarray:
        outputs = self.backbone_session.run(None, {self.backbone_input_name: features})
        logits = outputs[0]
        if logits.ndim == 1:
            logits = np.expand_dims(logits, axis=0)
        if self.head_session is None:
            return logits
        if self.head_input_name is None:
            raise RuntimeError("head input name is not set")
        head_inputs = logits
        head_outputs = self.head_session.run(None, {self.head_input_name: head_inputs})
        return head_outputs[0]
