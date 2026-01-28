# 热度公式审计脚本 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 新增可运行的 `scripts/audit_heat_v2.py`，支持 v2 热度审计与 `--repeat-fetch` 抖动检测（A1：`NeteaseEnhancedClient.fetch_track_detail`），输出完整 CSV/JSON/TXT。

**Architecture:** 脚本从样本输入加载数据，调用现有 v2 评分函数并计算中间量，输出逐曲 CSV 与汇总统计；可选重复拉取网易云详情用于抖动检测，不影响主审计流程。

**Tech Stack:** Python 3.10+、现有 `PyLyrics-Extractor` 评分模块、标准库统计

---

### Task 1: 为 repeat-fetch 抖动检测写失败测试

**Files:**
- Create: `apps/backend/PyLyrics-Extractor/tests/test_audit_heat_v2.py`

**Step 1: 写失败测试**

```python
from scripts.audit_heat_v2 import repeat_fetch_metrics


def test_repeat_fetch_metrics_reports_jitter():
    def fake_fetch(track_id):
        return {"popularity": 10, "comment_count": 1}

    out = repeat_fetch_metrics("123", "Song", 3, fake_fetch)
    assert out["same_popularity"] == 1
    assert out["same_comment"] == 1
    assert out["error"] is None
```

**Step 2: 运行测试确认失败**

Run: `pytest apps/backend/PyLyrics-Extractor/tests/test_audit_heat_v2.py::test_repeat_fetch_metrics_reports_jitter -v`

Expected: FAIL（`repeat_fetch_metrics` 未定义）

---

### Task 2: 实现 repeat-fetch 抖动检测工具函数

**Files:**
- Create: `scripts/audit_heat_v2.py`

**Step 1: 最小实现**

```python
def repeat_fetch_metrics(track_id, name, repeats, fetch_fn):
    # returns dict with popularity_run1..N, comment_run1..N, same_popularity, same_comment, error
    ...
```

**Step 2: 运行测试确认通过**

Run: `pytest apps/backend/PyLyrics-Extractor/tests/test_audit_heat_v2.py::test_repeat_fetch_metrics_reports_jitter -v`

Expected: PASS

---

### Task 3: 实现脚本主体与输出文件

**Files:**
- Create: `scripts/audit_heat_v2.py`

**Step 1: 写脚本主体（不触碰评分逻辑）**

- 实现输入加载顺序
- 调用现有评分 `compute_heat_score`
- 计算中间量并写 `out/heat_audit_rows.csv`
- 写 `out/heat_audit_summary.json` 与 `out/heat_audit_summary.txt`
- `--repeat-fetch` 走 `NeteaseEnhancedClient.fetch_track_detail` 并写 `out/heat_audit_fetch_jitter.csv`

**Step 2: 运行脚本冒烟**

Run: `python scripts/audit_heat_v2.py --limit 5`

Expected: `out/` 下生成 `heat_audit_rows.csv`、`heat_audit_summary.json`、`heat_audit_summary.txt`

---

### Task 4: 补充测试（字段语义与缺字段容错）

**Files:**
- Modify: `apps/backend/PyLyrics-Extractor/tests/test_audit_heat_v2.py`

**Step 1: 写失败测试**

```python
def test_repeat_fetch_metrics_handles_errors():
    def fake_fetch(_track_id):
        raise RuntimeError("boom")

    out = repeat_fetch_metrics("t1", "Song", 2, fake_fetch)
    assert out["same_popularity"] == 0
    assert out["same_comment"] == 0
    assert "boom" in (out["error"] or "")
```

**Step 2: 运行测试确认失败**

Run: `pytest apps/backend/PyLyrics-Extractor/tests/test_audit_heat_v2.py::test_repeat_fetch_metrics_handles_errors -v`

Expected: FAIL

**Step 3: 最小实现修复并确认通过**

Run: `pytest apps/backend/PyLyrics-Extractor/tests/test_audit_heat_v2.py::test_repeat_fetch_metrics_handles_errors -v`

Expected: PASS

---

### Task 5: 最终校验

**Step 1: 跑目标测试集**

Run: `pytest apps/backend/PyLyrics-Extractor/tests/test_audit_heat_v2.py -v`

Expected: PASS

**Step 2: 记录输出路径**

- `out/heat_audit_rows.csv`
- `out/heat_audit_summary.json`
- `out/heat_audit_summary.txt`
- `out/heat_audit_fetch_jitter.csv`（当使用 --repeat-fetch）

