# 导出对象可选（当前编排 + 已保存 Set）Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan.

**Goal:** 让导出对话框支持“当前编排 + 已保存 Set”的可交互导出对象选择，并保证导出内容与 UI 一致。

**Architecture:** 在 `ExportDialog` 内部增加导出对象选择与选中 set 的状态；由 `App.tsx` 传入当前编排与已保存 set 列表，统一计算导出 payload。

**Tech Stack:** React + TypeScript + Electron IPC

---

### Task 1: 为 ExportDialog 增加导出对象选择逻辑（TDD）

**Files:**
- Modify: `apps/frontend/DJ-ZOKEN/components/ExportDialog.tsx`
- Modify: `apps/frontend/DJ-ZOKEN/App.tsx`
- Test: `apps/frontend/DJ-ZOKEN/components/__tests__/export-dialog.test.tsx` (若无测试基建则只写最小渲染测试并跳过执行，需在说明中记录)

**Step 1: Write the failing test**
```tsx
import { render, screen } from '@testing-library/react'
import { ExportDialog } from '../ExportDialog'

test('切换到已保存 Set 后需要选择具体 Set', () => {
  render(
    <ExportDialog
      open
      onClose={() => {}}
      onConfirm={() => {}}
      tracks={[]}
      defaultSetName="Set A"
      savedSets={[{ id: 's1', name: 'Set 1', tracks: [{ id: 't1' } as any], type: 'prime', totalDuration: '00:10' }]}
    />
  )

  const sourceSelect = screen.getByLabelText('导出对象')
  expect(sourceSelect).toBeInTheDocument()
})
```

**Step 2: Run test to verify it fails**
Run: `npm test apps/frontend/DJ-ZOKEN/components/__tests__/export-dialog.test.tsx`
Expected: FAIL (组件缺少新 props/字段)

**Step 3: Write minimal implementation**
- `ExportDialog` 增加 `sourceType`、`selectedSetId` 状态
- 增加 `savedSets`、`currentTracks` 等 props
- 渲染“导出对象”选择器与已保存 set 下拉
- 计算 `activeTracks` 与 `payload`

**Step 4: Run test to verify it passes**
Run: `npm test apps/frontend/DJ-ZOKEN/components/__tests__/export-dialog.test.tsx`
Expected: PASS

**Step 5: Commit**
```bash
git add apps/frontend/DJ-ZOKEN/components/ExportDialog.tsx apps/frontend/DJ-ZOKEN/App.tsx apps/frontend/DJ-ZOKEN/components/__tests__/export-dialog.test.tsx
git commit -m "feat: add export source selector"
```

---

### Task 2: App.tsx 传入已保存 Set 并改造导出逻辑（TDD）

**Files:**
- Modify: `apps/frontend/DJ-ZOKEN/App.tsx`

**Step 1: Write the failing test**
(若无测试基建则写最小组件行为测试并记录跳过执行)

**Step 2: Run test to verify it fails**

**Step 3: Write minimal implementation**
- 将 `savedSetLists` 传入 ExportDialog
- 将 `setTracks` 与 `currentSetName` 传入
- 使用 ExportDialog 内部计算的 payload 进行导出

**Step 4: Run test to verify it passes**

**Step 5: Commit**
```bash
git add apps/frontend/DJ-ZOKEN/App.tsx
git commit -m "feat: wire export dialog with saved sets"
```

---

### Task 3: 手工验收（Electron）

**Files:**
- None

**Step 1: 启动前端 + Electron**
```bash
NEWSETKI_ROOT=/Users/apple/work/NEWSETki/.worktrees/set-export \
  bash ~/.codex/skills/dev-stack-runner/scripts/start_stack.sh
cd /Users/apple/work/NEWSETki/.worktrees/set-export/apps/desktop
VITE_DEV_SERVER_URL=http://localhost:3004 \
ELECTRON_RENDERER_URL=http://localhost:3004 \
SERATO_DIR="$HOME/Music/_Serato_" \
npm run dev
```

**Step 2: 验证交互**
- 选择“当前编排”导出成功
- 选择“已保存 Set”并选择具体 set，可导出
- 未选择 set 时确认按钮禁用

**Step 3: 记录结果**
在 `docs/plans/2026-01-27-export-object-implementation-plan.md` 末尾追加验证记录

---

**Plan complete and saved to `docs/plans/2026-01-27-export-object-implementation-plan.md`. Two execution options:**

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
