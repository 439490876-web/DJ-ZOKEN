# Heat v2.4 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在 pop_comment_v2 分支内按 v2.4 公式计算热度，仅使用 popularity + comment_count，并更新 .env.example 默认值。

**Architecture:** 保持现有热度结构不变，只替换 pop_term/comment_term/lifetime/raw/heat_10 计算；breakdown 增加关键字段；新歌 floor 与 club_boost 保持。

**Tech Stack:** Python 3.10+, pytest

---

### Task 1: 新增 v2.4 单元测试

**Files:**
- Modify: `apps/backend/PyLyrics-Extractor/tests/test_scoring.py`

**Step 1: Write the failing test**

```python
def test_pop_comment_v24_formula(monkeypatch):
    monkeypatch.setenv("POP_GAMMA", "1.6")
    monkeypatch.setenv("POP_TOP_START", "95")
    monkeypatch.setenv("POP_TOP_BOOST", "0.35")
    monkeypatch.setenv("COMMENT_REF", "50000")
    monkeypatch.setenv("COMMENT_GAMMA", "1.15")
    monkeypatch.setenv("POP_WEIGHT", "0.60")
    monkeypatch.setenv("CMT_WEIGHT", "0.40")
    monkeypatch.setenv("RAW_SCALE", "8.0")
    monkeypatch.setenv("HEAT_POP_BASELINE", "15")

    metrics = {
        "play_count": 0,
        "comment_count": 50000,
        "liked_count": 0,
        "share_count": 0,
        "_popularity": 100,
        "_raw_title": "Test",
        "_cleaned_title": "Test",
    }
    out = compute_heat_score(metrics, debug=True)
    v2 = out["breakdown"]["v2"]
    assert round(v2["pop_term"], 4) == 1.35
    assert round(v2["cmt_term"], 4) == 1.0
    assert round(v2["pop_top"], 4) == 0.35
    assert round(v2["raw"], 2) == 9.68
    assert "heat_10" in v2
```

**Step 2: Run test to verify it fails**
Run: `pytest apps/backend/PyLyrics-Extractor/tests/test_scoring.py::test_pop_comment_v24_formula -v`
Expected: FAIL（字段缺失/公式不一致）

---

### Task 2: 替换 pop_comment_v2 公式 + breakdown 字段

**Files:**
- Modify: `apps/backend/PyLyrics-Extractor/app/services/scoring.py`

**Step 1: Implement minimal code**
- 使用新公式计算 pop_term/cmt_term/lifetime_raw/raw/heat_10
- 保留 club_boost 与新歌 floor
- breakdown.v2 增加 pop_term/cmt_term/pop_top/raw/heat_10

**Step 2: Run test to verify it passes**
Run: `pytest apps/backend/PyLyrics-Extractor/tests/test_scoring.py::test_pop_comment_v24_formula -v`
Expected: PASS

---

### Task 3: 更新 .env.example 默认值

**Files:**
- Modify: `apps/backend/PyLyrics-Extractor/.env.example`

**Step 1: Update env defaults**
- 添加 POP_GAMMA/POP_TOP_START/POP_TOP_BOOST/COMMENT_REF/COMMENT_GAMMA/POP_WEIGHT/CMT_WEIGHT/RAW_SCALE 默认值

**Step 2: Verify file updated**
Run: `rg -n "POP_GAMMA|RAW_SCALE" apps/backend/PyLyrics-Extractor/.env.example`
Expected: 新变量存在

---

### Task 4: 回归审计

**Files:**
- Output: `out/heat_audit_summary.json`

**Step 1: Run audit**
```bash
python scripts/audit_heat_v2.py --input data/heat_samples.json
```

**Step 2: 输出分布变化**
- heat_score 分布
- heat_score_raw min/median/p90/max
- 7 桶占比 / raw 桶占比

