# Liquid Glass UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在不改变功能与信息结构的前提下，为 DJ-ZOKEN 三栏主界面落地 Liquid Glass 视觉体系与双主题切换，并输出 Pencil MCP 预览图。

**Architecture:** 通过全局 CSS Tokens + 根节点 `data-theme` 实现两套主题切换；抽象 GlassPanel / GlassCard / GlassButton 复用视觉体系；仅微调布局比例与间距以强化中间主舞台，所有变更集中在样式与 UI 结构层。

**Tech Stack:** React 19 + Vite + Tailwind CDN + 自定义 CSS（`index.html` 内联样式）+ Vitest/Testing Library。

### Task 1: Pencil MCP 基线截图（Before）

**Files:**
- 无代码文件变更

**Step 1: 打开 Pencil MCP 并读取当前页面结构**
- 使用 `mcp__pencil__get_editor_state` 与 `mcp__pencil__open_document`。

**Step 2: 截图当前主界面**
- 使用 `mcp__pencil__get_screenshot` 生成 Before 预览图。

**Step 3: 记录问题点（短清单）**
- 保存到工作记录（最终回复里汇总）。

**Step 4: 无需测试**
- 跳过。

**Step 5: 无需提交**
- 跳过。

### Task 2: 主题 Tokens + 主题切换（可见开关）

**Files:**
- Create: `apps/frontend/DJ-ZOKEN/theme.css`
- Create: `apps/frontend/DJ-ZOKEN/services/themeStorage.ts`
- Create: `apps/frontend/DJ-ZOKEN/components/ThemeToggle.tsx`
- Modify: `apps/frontend/DJ-ZOKEN/index.tsx`
- Modify: `apps/frontend/DJ-ZOKEN/index.html`
- Modify: `apps/frontend/DJ-ZOKEN/App.tsx:~1960-2620`
- Test: `apps/frontend/DJ-ZOKEN/__tests__/theme-toggle.test.tsx`

**Step 1: 写失败测试**
```ts
import { describe, it, expect } from 'vitest';
import { getStoredTheme, setStoredTheme } from '../services/themeStorage';

describe('themeStorage', () => {
  it('persists theme and updates document dataset', () => {
    setStoredTheme('neutral');
    expect(getStoredTheme()).toBe('neutral');
    expect(document.documentElement.dataset.theme).toBe('neutral');
  });
});
```

**Step 2: 运行测试验证失败**
Run: `npm test -- --run tests/theme-toggle.test.tsx`
Expected: FAIL with “Cannot find module” or missing functions.

**Step 3: 最小实现**
- 新建 `theme.css`：定义 Warm Glass + Neutral Smoke 变量、统一圆角/阴影/模糊/间距/字体层级。
- 新建 `themeStorage.ts`：封装 `getStoredTheme()` / `setStoredTheme()`，同步 `document.documentElement.dataset.theme`。
- 新建 `ThemeToggle`：顶部工具栏右侧可见开关（不改业务字段）。
- `index.tsx` 引入 `theme.css` 并在启动时调用 `getStoredTheme()`。
- `index.html` 移除旧变量块或缩减为最小（保留 Tailwind 配置与字体引入）。

**Step 4: 运行测试验证通过**
Run: `npm test -- --run tests/theme-toggle.test.tsx`
Expected: PASS.

**Step 5: 提交**
```bash
git add apps/frontend/DJ-ZOKEN/theme.css \
  apps/frontend/DJ-ZOKEN/services/themeStorage.ts \
  apps/frontend/DJ-ZOKEN/components/ThemeToggle.tsx \
  apps/frontend/DJ-ZOKEN/index.tsx \
  apps/frontend/DJ-ZOKEN/index.html \
  apps/frontend/DJ-ZOKEN/App.tsx \
  apps/frontend/DJ-ZOKEN/__tests__/theme-toggle.test.tsx

git commit -m "feat(ui): add liquid-glass tokens and theme toggle"
```

### Task 3: 玻璃组件抽象（GlassPanel/Card/Button）

**Files:**
- Create: `apps/frontend/DJ-ZOKEN/components/GlassPanel.tsx`
- Create: `apps/frontend/DJ-ZOKEN/components/GlassCard.tsx`
- Create: `apps/frontend/DJ-ZOKEN/components/GlassButton.tsx`
- Modify: `apps/frontend/DJ-ZOKEN/App.tsx:~1960-2620`
- Modify: `apps/frontend/DJ-ZOKEN/components/SetBuilder.tsx`
- Modify: `apps/frontend/DJ-ZOKEN/components/SavedSetLibrary.tsx`
- Modify: `apps/frontend/DJ-ZOKEN/components/ExportDialog.tsx`
- Modify: `apps/frontend/DJ-ZOKEN/components/ResetConfirmDialog.tsx`
- Modify: `apps/frontend/DJ-ZOKEN/components/EnergyChart.tsx`
- Test: `apps/frontend/DJ-ZOKEN/__tests__/glass-components.test.tsx`

**Step 1: 写失败测试**
```tsx
import { render } from '@testing-library/react';
import { GlassCard } from '../components/GlassCard';

it('renders glass card with base class', () => {
  const { getByTestId } = render(<GlassCard data-testid="glass" />);
  expect(getByTestId('glass').className).toContain('glass-card');
});
```

**Step 2: 运行测试验证失败**
Run: `npm test -- --run tests/glass-components.test.tsx`
Expected: FAIL (component not found).

**Step 3: 最小实现**
- 实现玻璃组件，统一圆角、边框、阴影、blur 与 hover/press 动效。
- 用新组件替换现有 `glass-panel`/`glass-card` 直接 className 的位置。

**Step 4: 运行测试验证通过**
Run: `npm test -- --run tests/glass-components.test.tsx`
Expected: PASS.

**Step 5: 提交**
```bash
git add apps/frontend/DJ-ZOKEN/components/GlassPanel.tsx \
  apps/frontend/DJ-ZOKEN/components/GlassCard.tsx \
  apps/frontend/DJ-ZOKEN/components/GlassButton.tsx \
  apps/frontend/DJ-ZOKEN/App.tsx \
  apps/frontend/DJ-ZOKEN/components/SetBuilder.tsx \
  apps/frontend/DJ-ZOKEN/components/SavedSetLibrary.tsx \
  apps/frontend/DJ-ZOKEN/components/ExportDialog.tsx \
  apps/frontend/DJ-ZOKEN/components/ResetConfirmDialog.tsx \
  apps/frontend/DJ-ZOKEN/components/EnergyChart.tsx \
  apps/frontend/DJ-ZOKEN/__tests__/glass-components.test.tsx

git commit -m "refactor(ui): introduce glass components"
```

### Task 4: 三栏比例与组件视觉升级（列表、按钮、图表、空状态）

**Files:**
- Modify: `apps/frontend/DJ-ZOKEN/App.tsx:~1960-2620`
- Modify: `apps/frontend/DJ-ZOKEN/components/SetBuilder.tsx`
- Modify: `apps/frontend/DJ-ZOKEN/components/EnergyChart.tsx`
- Modify: `apps/frontend/DJ-ZOKEN/components/SavedSetLibrary.tsx`
- Modify: `apps/frontend/DJ-ZOKEN/components/ExportDialog.tsx`
- Modify: `apps/frontend/DJ-ZOKEN/components/ResetConfirmDialog.tsx`

**Step 1: 写失败测试**
```tsx
import { render } from '@testing-library/react';
import { GlassButton } from '../components/GlassButton';

it('applies primary gradient style', () => {
  const { getByRole } = render(<GlassButton variant="primary">保存</GlassButton>);
  expect(getByRole('button').className).toContain('btn-primary');
});
```

**Step 2: 运行测试验证失败**
Run: `npm test -- --run tests/glass-components.test.tsx`
Expected: FAIL (variant class missing).

**Step 3: 最小实现**
- 调整三栏宽度（中间 44~48%）、左右收窄。
- 统一三栏 header 高度与 padding。
- 列表项：封面 + 标题/艺人 + 统一 Pill 标签体系，hover 提亮、选中态描边。
- 按钮：主按钮暖色细腻渐变 + 高光边，次按钮玻璃次级态。
- 图表背景改为轻玻璃底，网格线更淡；空状态更中性系统提示感。

**Step 4: 运行测试验证通过**
Run: `npm test -- --run tests/glass-components.test.tsx`
Expected: PASS.

**Step 5: 提交**
```bash
git add apps/frontend/DJ-ZOKEN/App.tsx \
  apps/frontend/DJ-ZOKEN/components/SetBuilder.tsx \
  apps/frontend/DJ-ZOKEN/components/EnergyChart.tsx \
  apps/frontend/DJ-ZOKEN/components/SavedSetLibrary.tsx \
  apps/frontend/DJ-ZOKEN/components/ExportDialog.tsx \
  apps/frontend/DJ-ZOKEN/components/ResetConfirmDialog.tsx

git commit -m "style(ui): refine three-column layout and cards"
```

### Task 5: Pencil MCP 预览图（After）

**Files:**
- 无代码文件变更

**Step 1: 更新 Pencil MCP 画面**
- 使用 `mcp__pencil__batch_design` 或 `mcp__pencil__open_document` 同步变更。

**Step 2: 输出 After 预览图**
- 使用 `mcp__pencil__get_screenshot`。

**Step 3: 无需测试**
- 跳过。

**Step 4: 无需提交**
- 跳过。

### Task 6: 全量测试与收尾

**Files:**
- 无新增文件

**Step 1: 运行全量测试**
Run: `npm test`
Expected: PASS（注意记录现有警告）。

**Step 2: 整理输出与回滚说明**
- 汇总变更文件、截图、问题清单与回滚方案。

**Step 3: 提交（如有遗漏）**
```bash
git add -A
git commit -m "chore(ui): finalize liquid glass refresh"
```
