# Netease 详情抖动修复 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复 `NeteaseEnhancedClient.fetch_track_detail` 返回空（netease_detail_empty）问题，新增诊断脚本与抖动检测输出，让 `audit_heat_v2.py --repeat-fetch` 生成有效统计。

**Architecture:** 为 NeteaseEnhancedClient 增强校验/重试/日志/回退，新增可选 NCM_DEBUG 日志与 error_reason_chain；audit 脚本只做抖动检测，不影响主评分。

**Tech Stack:** Python 3.10+, requests (现有客户端), 标准 logging

---

### Task 1: 新增 repeat-fetch 失败链路测试

**Files:**
- Modify: `apps/backend/PyLyrics-Extractor/tests/test_audit_heat_v2.py`
- Create: `apps/backend/PyLyrics-Extractor/tests/test_netease_client_detail.py`

**Step 1: 写失败测试（invalid_track_id / empty_json / fallback success）**

```python
def test_invalid_track_id_format(monkeypatch):
    from app.clients.netease_enhanced import NeteaseEnhancedClient
    client = NeteaseEnhancedClient()
    out = client.fetch_track_detail_with_meta("local-123")
    assert out["ok"] is False
    assert out["error_reason"] == "invalid_track_id_format"
```

**Step 2: 运行测试确认失败**

Run: `pytest apps/backend/PyLyrics-Extractor/tests/test_netease_client_detail.py::test_invalid_track_id_format -v`

Expected: FAIL

---

### Task 2: 实现 fetch_track_detail 诊断与回退

**Files:**
- Modify: `apps/backend/PyLyrics-Extractor/app/clients/netease_enhanced.py`

**Step 1: 最小实现**
- 添加 `fetch_track_detail_with_meta()`：返回 `{ok, error_reason, error_chain, detail, raw_source}`
- 校验 track_id 必须为数字
- NCM_DEBUG=1 时打印日志（endpoint/status/len/parsed songs/error class）
- Fallback：主 detail -> 备选 detail 接口

**Step 2: 运行测试确认通过**

Run: `pytest apps/backend/PyLyrics-Extractor/tests/test_netease_client_detail.py -v`

Expected: PASS

---

### Task 3: 诊断脚本 debug_netease_detail.py

**Files:**
- Create: `scripts/debug_netease_detail.py`

**Step 1: 写脚本**
- 支持 `--track-id`、`--repeat`
- 输出 ok/error_reason/raw_source/popularity/comment_count/publish_time

**Step 2: 冒烟**

Run: `python scripts/debug_netease_detail.py --track-id 123 --repeat 2`

---

### Task 4: 更新 audit_heat_v2 repeat-fetch 输出

**Files:**
- Modify: `scripts/audit_heat_v2.py`
- Modify: `apps/backend/PyLyrics-Extractor/tests/test_audit_heat_v2.py`

**Step 1: repeat-fetch 使用 fetch_track_detail_with_meta**
- 输出 `failed`, `error_reason`, `raw_source_runX`, `popularity_source`, `comment_source`
- same_xxx 判定：任一 run 为 None => failed=1

**Step 2: 运行测试确认通过**

Run: `pytest apps/backend/PyLyrics-Extractor/tests/test_audit_heat_v2.py -v`

---

### Task 5: 最终验证

**Step 1: debug 脚本**

Run: `NCM_DEBUG=1 python scripts/debug_netease_detail.py --track-id 123 --repeat 3`

**Step 2: 抖动检测冒烟**

Run: `python scripts/audit_heat_v2.py --repeat-fetch 3 --limit 5`

