# Inspect NCM Detail Fields Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 新增 `scripts/inspect_ncm_detail_fields.py`，抽样调用详情接口并导出字段快照，打印 popularity=100 占比。

**Architecture:** 脚本读取 `data/heat_samples.json` → 选择样本 → 调用 `NeteaseEnhancedClient.fetch_track_detail_with_meta` → 输出 CSV + 统计。

**Tech Stack:** Python 3.10+, CSV/JSON 标准库

---

### Task 1: 测试用例（抽样与占比统计）

**Files:**
- Create: `apps/backend/PyLyrics-Extractor/tests/test_inspect_ncm_detail_fields.py`

**Step 1: Write the failing test**

```python
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
```

**Step 2: Run test to verify it fails**

Run: `pytest apps/backend/PyLyrics-Extractor/tests/test_inspect_ncm_detail_fields.py -v`
Expected: FAIL (functions missing)

---

### Task 2: 实现脚本主逻辑

**Files:**
- Create: `scripts/inspect_ncm_detail_fields.py`

**Step 1: Write minimal implementation**
- 读取 JSON
- 过滤 detail_ok=1
- 抽样 20 条或 top-score
- 调用 `fetch_track_detail_with_meta`
- 导出 `out/ncm_detail_field_snapshot.csv`
- 计算 popularity=100 占比（抽样 + 全量）并打印

**Step 2: Run test to verify it passes**
Run: `pytest apps/backend/PyLyrics-Extractor/tests/test_inspect_ncm_detail_fields.py -v`
Expected: PASS

---

### Task 3: 运行脚本并输出

**Files:**
- Output: `out/ncm_detail_field_snapshot.csv`

**Step 1: Run**
```bash
python scripts/inspect_ncm_detail_fields.py --input data/heat_samples.json
```

**Step 2: Output**
- 打印抽样/全量 popularity=100 占比
- CSV 生成成功

