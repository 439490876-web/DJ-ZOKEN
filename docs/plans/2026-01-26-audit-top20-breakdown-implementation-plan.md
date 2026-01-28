# Audit Top20 Breakdown Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在 audit_heat_v2.py 增加 top20_breakdown.csv 输出与 raw 统计打印，并与 v2.4 公式一致。

**Architecture:** 更新 audit 的 v2 中间量计算，新增 top20 输出函数与控制台统计。

**Tech Stack:** Python 3.10+, pytest

---

### Task 1: 新增测试覆盖（v2.4 中间量 + top20 排序）

**Files:**
- Modify: `apps/backend/PyLyrics-Extractor/tests/test_audit_heat_v2.py`

**Step 1: Write the failing test**

```python
from scripts.audit_heat_v2 import compute_v2_intermediates, build_top20_breakdown

def test_v24_intermediates_pop_top():
    params = get_env_params()
    now_ts = 1_700_000_000_000
    sample = {
        "track_id": "t1",
        "name": "Test",
        "popularity": 100,
        "comment_count": 50000,
        "publish_time": now_ts - 30 * 86400 * 1000,
    }
    out = compute_v2_intermediates(sample, params, now_ts)
    assert out["pop_term"] >= 1.0
    assert out["pop_top"] == pytest.approx(0.35, abs=1e-6)
    assert out["cmt_term"] == pytest.approx(1.0, abs=1e-6)


def test_build_top20_breakdown_sorted():
    rows = [
        {"track_id": "a", "name": "A", "popularity": 1, "comment_count": 1, "pop_term": 0.1, "cmt_term": 0.1, "pop_top": 0.0, "raw": 1.0, "heat_10_raw": 2.0, "heat_score_raw": 2.0},
        {"track_id": "b", "name": "B", "popularity": 1, "comment_count": 1, "pop_term": 0.2, "cmt_term": 0.2, "pop_top": 0.0, "raw": 2.0, "heat_10_raw": 3.0, "heat_score_raw": 3.0},
    ]
    out = build_top20_breakdown(rows, limit=1)
    assert out[0]["track_id"] == "b"
```

**Step 2: Run test to verify it fails**
Run: `pytest apps/backend/PyLyrics-Extractor/tests/test_audit_heat_v2.py::test_v24_intermediates_pop_top -v`
Expected: FAIL

---

### Task 2: 更新 audit v2.4 计算 + top20 输出

**Files:**
- Modify: `scripts/audit_heat_v2.py`

**Step 1: Implement minimal code**
- get_env_params 增加 POP_GAMMA/POP_TOP_START/POP_TOP_BOOST/COMMENT_REF/COMMENT_GAMMA/POP_WEIGHT/CMT_WEIGHT/RAW_SCALE
- compute_v2_intermediates 切换为 v2.4 公式并输出 pop_top/cmt_term/raw/heat_10
- 新增 build_top20_breakdown(rows, limit=20) 输出指定字段
- 在 main 中写出 `out/top20_breakdown.csv`
- 控制台打印 raw 统计（max/p95/median），并提示是否 <= 60

**Step 2: Run test to verify it passes**
Run: `pytest apps/backend/PyLyrics-Extractor/tests/test_audit_heat_v2.py::test_v24_intermediates_pop_top -v`
Expected: PASS

---

### Task 3: 回归审计输出

**Files:**
- Output: `out/top20_breakdown.csv`

**Step 1: Run**
```bash
python scripts/audit_heat_v2.py --input data/heat_samples.json
```

**Step 2: Output**
- 控制台打印 raw 统计
- CSV 生成成功

