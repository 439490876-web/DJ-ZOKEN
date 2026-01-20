from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

import numpy as np


def _normalize_shape(shape: List[Any]) -> List[Optional[int]]:
    normalized = []
    for dim in shape:
        if isinstance(dim, (int, np.integer)):
            normalized.append(int(dim))
        else:
            normalized.append(None)
    return normalized


def get_io_summary(session) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    inputs = session.get_inputs()
    outputs = session.get_outputs()
    input_info = inputs[0]
    output_info = outputs[0]
    return (
        {"name": input_info.name, "shape": _normalize_shape(input_info.shape)},
        {"name": output_info.name, "shape": _normalize_shape(output_info.shape)},
    )


def resolve_output_dim(
    session,
    *,
    output_name: str,
    input_name: str,
    dummy_input: Optional[np.ndarray],
) -> int:
    output_info = session.get_outputs()[0]
    shape = output_info.shape
    output_dim = None
    if shape and isinstance(shape[-1], (int, np.integer)):
        output_dim = int(shape[-1])
    if output_dim is None:
        if dummy_input is None:
            raise RuntimeError("unable to infer output dimension without dummy input")
        output = session.run([output_name], {input_name: dummy_input})[0]
        output_dim = int(output.shape[-1])
    return output_dim
