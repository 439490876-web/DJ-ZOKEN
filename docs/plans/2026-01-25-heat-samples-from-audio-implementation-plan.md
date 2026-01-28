# Heat Samples From Audio Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 从本地音频目录生成热度审计样本（含 ncm-api 搜索匹配与复核 CSV），并自动跑两次审计输出关键统计。

**Architecture:** 新增脚本 `scripts/build_heat_samples_from_audio.py` 读取音频标签→清洗→ncm-api 搜索→评分择优→导出 JSON/CSV；审计脚本复用 `scripts/audit_heat_v2.py`。

**Tech Stack:** Python 3.10+、mutagen（可选）、requests、现有 cleaning.py

---

### Task 1: 测试用例（匹配评分 + CSV 展开列）

**Files:**
- Create: `apps/backend/PyLyrics-Extractor/tests/test_build_heat_samples.py`

**Step 1: Write the failing test**

```python
from scripts.build_heat_samples_from_audio import score_candidate, flatten_candidates

def test_score_candidate_prefers_title_artist_match():
    sample = {
        "clean_title": "pepas",
        "clean_artist": "farruko",
        "duration": 200.0,
    }
    candidate = {
        "id": "123",
        "name": "Pepas",
        "artists": ["Farruko"],
        "duration": 200000,
    }
    score = score_candidate(sample, candidate)
    assert score >= 80


def test_flatten_candidates_expands_columns():
    candidates = [
        {"id": "1", "name": "A", "artists": ["X"], "duration": 100000, "score": 88},
        {"id": "2", "name": "B", "artists": ["Y"], "duration": 120000, "score": 70},
    ]
    row = flatten_candidates(candidates, max_candidates=5)
    assert row["cand1_id"] == "1"
    assert row["cand1_name"] == "A"
    assert row["cand1_artist"] == "X"
    assert row["cand1_duration"] == 100000
    assert row["cand1_score"] == 88
    assert row["cand5_id"] in ("", None)
```

**Step 2: Run test to verify it fails**

Run: `pytest apps/backend/PyLyrics-Extractor/tests/test_build_heat_samples.py -v`
Expected: FAIL (functions missing)

---

### Task 2: 实现脚本基础逻辑（评分、候选展开、清洗）

**Files:**
- Create: `scripts/build_heat_samples_from_audio.py`

**Step 1: Write minimal implementation**

```python
# 提供 score_candidate(sample, candidate)
# 提供 flatten_candidates(candidates, max_candidates=5)
# 提供 clean_text_from_tags(...) 调用 cleaning.clean_track
```

**Step 2: Run test to verify it passes**

Run: `pytest apps/backend/PyLyrics-Extractor/tests/test_build_heat_samples.py -v`
Expected: PASS

---

### Task 3: 音频扫描 + ncm-api 搜索 + 输出 JSON/CSV

**Files:**
- Modify: `scripts/build_heat_samples_from_audio.py`
- Create (runtime output): `data/heat_samples.json`
- Create (runtime output): `out/heat_samples_review.csv`
- Create (runtime output): `out/heat_samples_unmatched.csv`

**Step 1: Write failing test（最小 smoke，mock requests/mutagen）**

```python
# 用 monkeypatch 让 mutagen 读出固定 title/artist/duration
# 用 monkeypatch 让 requests.get 返回固定 search 结果
# 断言输出 JSON/CSV 路径被写入
```

**Step 2: Run test to verify it fails**
Run: `pytest apps/backend/PyLyrics-Extractor/tests/test_build_heat_samples.py -v`
Expected: FAIL（写入/搜索未实现）

**Step 3: Implement minimal code**
- 扫描音频目录
- mutagen 缺失时友好提示
- 调用 ncm-api search（limit=5,type=1）
- 评分择优 & min-score 过滤
- 生成 JSON & CSV（review/unmatched），review 展开 top5 列

**Step 4: Run test to verify it passes**
Run: `pytest apps/backend/PyLyrics-Extractor/tests/test_build_heat_samples.py -v`
Expected: PASS

---

### Task 4: 实际运行 + 审计验证

**Files:**
- Runtime outputs: `data/heat_samples.json`, `out/heat_samples_review.csv`, `out/heat_samples_unmatched.csv`
- Audit outputs: `out/heat_audit_rows.csv`, `out/heat_audit_summary.json`, `out/heat_audit_summary.txt`, `out/heat_audit_fetch_jitter.csv`

**Step 1: 生成样本**
Run:
```bash
python scripts/build_heat_samples_from_audio.py \
  --audio-dir /Users/apple/work/112teset \
  --out-json data/heat_samples.json \
  --min-score 70
```

**Step 2: 运行审计（全量）**
Run:
```bash
python scripts/audit_heat_v2.py --input data/heat_samples.json
```

**Step 3: 运行抖动检测（limit 20）**
Run:
```bash
python scripts/audit_heat_v2.py --input data/heat_samples.json --repeat-fetch 3 --limit 20
```

**Step 4: 输出关键统计**
- heat_score 分布
- 7 分桶 & RAW 桶占比
- repeat-fetch 失败率 Top3 原因

