# Heat Auto Verify Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan.

**目标：** 在 dev-stack-runner 启动流程中自动执行热度后端校验（清缓存 + 重启 8002 + 验证 `heat_source=v4-popcomment`），避免前端命中旧缓存或旧服务。

**架构：** 新增脚本 `scripts/verify_heat_backend.py`，作为启动后的校验器；在 `~/.codex/skills/dev-stack-runner/scripts/start_stack.sh` 末尾调用该脚本（可通过环境变量开关）。脚本提供可复用的 CLI 和清晰退出码。

**技术栈：** Python 3.10+、requests、sqlite3、bash。

---

### Task 1: 设计校验脚本的 CLI 与输出

**Files:**
- Create: `scripts/verify_heat_backend.py`
- Test: `tests/test_verify_heat_backend.py`

**Step 1: 写失败测试（CLI 参数解析）**
```python
# tests/test_verify_heat_backend.py

def test_verify_heat_backend_cli_defaults():
    # 预期脚本支持默认参数并可被调用
    pass
```

**Step 2: 运行测试确认失败**
Run: `pytest tests/test_verify_heat_backend.py::test_verify_heat_backend_cli_defaults -q`
Expected: FAIL（脚本不存在）

**Step 3: 写最小实现（脚本骨架）**
```python
# scripts/verify_heat_backend.py
# 解析参数：--base-url --audio-file --db-path --timeout --strict
# 返回 0/非0，并打印清晰状态
```

**Step 4: 运行测试确认通过**
Run: `pytest tests/test_verify_heat_backend.py::test_verify_heat_backend_cli_defaults -q`
Expected: PASS

**Step 5: Commit**
```bash
git add scripts/verify_heat_backend.py tests/test_verify_heat_backend.py

git commit -m "feat: add heat backend verify script skeleton"
```

---

### Task 2: 实现缓存清理 + 服务重启 + heat_source 校验

**Files:**
- Modify: `scripts/verify_heat_backend.py`
- Test: `tests/test_verify_heat_backend.py`

**Step 1: 写失败测试（缓存清理 + 校验逻辑）**
```python
# tests/test_verify_heat_backend.py

def test_verify_clears_cache_and_checks_heat_source(monkeypatch, tmp_path):
    # mock sqlite3 + requests
    # 预期：清 cache 表、调用 /identify、检查 heat_source
    pass
```

**Step 2: 运行测试确认失败**
Run: `pytest tests/test_verify_heat_backend.py::test_verify_clears_cache_and_checks_heat_source -q`
Expected: FAIL

**Step 3: 写最小实现（核心逻辑）**
- 清理 `db_path` 的 `cache` 表（若不存在则提示但不中断）
- 检测 8002：若未监听则启动；若监听则重启
- 用 requests 调 `/identify?debug=true` 读取 `evidence.heat_source`
- 当 heat_source != v4-popcomment 时返回非 0

**Step 4: 运行测试确认通过**
Run: `pytest tests/test_verify_heat_backend.py::test_verify_clears_cache_and_checks_heat_source -q`
Expected: PASS

**Step 5: Commit**
```bash
git add scripts/verify_heat_backend.py tests/test_verify_heat_backend.py

git commit -m "feat: implement heat backend auto verify"
```

---

### Task 3: 接入 dev-stack-runner 启动脚本

**Files:**
- Modify: `~/.codex/skills/dev-stack-runner/scripts/start_stack.sh`
- Docs: `docs/plans/2026-01-26-heat-auto-verify-implementation-plan.md`（更新执行说明）

**Step 1: 写失败测试（可跳过）**
此为 bash 变更，使用人工验证替代测试：运行 start_stack.sh，检查是否触发 verify 脚本。

**Step 2: 最小改动**
- 在 `start_stack.sh` 末尾添加：
  ```bash
  if [ "${HEAT_AUTO_VERIFY:-1}" = "1" ]; then
    python /Users/apple/work/NEWSETki/.worktrees/heat-audit-script/scripts/verify_heat_backend.py
  fi
  ```
- 允许用 `HEAT_AUTO_VERIFY=0` 关闭

**Step 3: 验证**
Run: `bash ~/.codex/skills/dev-stack-runner/scripts/start_stack.sh`
Expected: 控制台输出 heat verify 结果（success/failed）

**Step 4: Commit**
```bash
git add ~/.codex/skills/dev-stack-runner/scripts/start_stack.sh

git commit -m "chore: hook heat auto verify into start_stack"
```

---

### Task 4: 补充使用说明与回滚

**Files:**
- Modify: `docs/plans/2026-01-26-heat-auto-verify-implementation-plan.md`

**Step 1: 补充说明**
- 如何关闭：`HEAT_AUTO_VERIFY=0`
- 如何单独运行：`python scripts/verify_heat_backend.py`
- 回滚：移除 start_stack.sh 的 verify 调用

**Step 2: Commit**
```bash
git add docs/plans/2026-01-26-heat-auto-verify-implementation-plan.md

git commit -m "docs: add heat auto verify usage"
```

---

## 执行说明

- 计划执行需使用 `superpowers:executing-plans`。
- 如果你选择“子代理逐任务执行”，将改用 `superpowers:subagent-driven-development`。



## 使用说明

- 默认启用：`HEAT_AUTO_VERIFY=1`（start_stack 自动调用）
- 关闭自动校验：
  ```bash
  HEAT_AUTO_VERIFY=0 bash ~/.codex/skills/dev-stack-runner/scripts/start_stack.sh
  ```
- 指定校验音频（避免 sample.wav 低置信度）：
  ```bash
  HEAT_VERIFY_AUDIO=/path/to/good.mp3 python scripts/verify_heat_backend.py --strict
  ```
- 单独运行校验：
  ```bash
  python scripts/verify_heat_backend.py --strict
  ```

## 回滚方式

- 从 `~/.codex/skills/dev-stack-runner/scripts/start_stack.sh` 移除自动校验 block
- 或设置 `HEAT_AUTO_VERIFY=0` 关闭
