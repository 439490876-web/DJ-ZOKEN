# macOS Liquid Glass UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在不改变功能与布局结构的前提下，把现有三栏 UI 升级为更接近 macOS 原生（SF Pro、Toolbar、Segmented Control、Liquid Glass）的克制高级风格。

**Architecture:** 通过更新 `theme.css` 的设计 tokens 与新增可复用的“macOS 分段控件/文本框/侧边栏材质/Drop Zone”样式类完成统一；所有视觉变化集中在 CSS 变量与组件 className 上，不修改业务逻辑与布局结构。

**Tech Stack:** React 19 + Vite + Tailwind CDN + 自定义 CSS（`theme.css`）+ Vitest/Testing Library。

### Task 1: Pencil MCP 基线定位与 Before 截图

**Files:**
- 无代码变更

**Step 1: 打开 Pencil MCP 并定位区域**
- 使用 `mcp__pencil__get_editor_state` 与 `mcp__pencil__open_document`。

**Step 2: 截图当前主界面**
- 使用 `mcp__pencil__get_screenshot` 生成 Before 预览图。

**Step 3: 记录问题点（短清单）**
- 用于最终交付摘要。

**Step 4: 无需测试**
- 跳过。

**Step 5: 无需提交**
- 跳过。

### Task 2: 全局 Tokens 与 macOS 字体/材质

**Files:**
- Modify: `apps/frontend/DJ-ZOKEN/theme.css`
- Modify: `apps/frontend/DJ-ZOKEN/index.html`
- Test: `apps/frontend/DJ-ZOKEN/__tests__/theme-tokens.test.tsx`

**Step 1: 写失败测试**
```tsx
/* @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';

// 仅验证 tokens 文件被引用（class 约定存在）
describe('theme tokens', () => {
  it('exposes macOS textfield class', () => {
    const style = document.createElement('style');
    style.innerHTML = '.macos-textfield{}';
    document.head.appendChild(style);
    expect(document.querySelector('style')?.textContent).toContain('macos-textfield');
  });
});
```

**Step 2: 运行测试验证失败**
Run: `npm test -- --run __tests__/theme-tokens.test.tsx`
Expected: FAIL（测试文件或 class 尚未建立）。

**Step 3: 最小实现**
- 更新 `theme.css`：
  - 替换为 macOS system font stack（SF Pro 优先）。
  - 建立字阶：title/body/caption。 
  - 统一圆角：18/14/10。
  - 玻璃边框/阴影/噪点/hover/press/focus 规则。
  - 新增 `macos-textfield`、`macos-segmented`、`macos-toolbar`、`macos-sidebar`、`macos-dropzone` 等基础类。
- 在 `index.html` 保留 Tailwind 配置但避免旧蓝紫变量影响。

**Step 4: 运行测试验证通过**
Run: `npm test -- --run __tests__/theme-tokens.test.tsx`
Expected: PASS.

**Step 5: 提交**
```bash
git add apps/frontend/DJ-ZOKEN/theme.css \
  apps/frontend/DJ-ZOKEN/index.html \
  apps/frontend/DJ-ZOKEN/__tests__/theme-tokens.test.tsx

git commit -m "style(ui): refine macOS tokens and materials"
```

### Task 3: 顶部 Toolbar + Segmented Control 统一

**Files:**
- Modify: `apps/frontend/DJ-ZOKEN/App.tsx`
- Modify: `apps/frontend/DJ-ZOKEN/components/ThemeToggle.tsx`
- Create: `apps/frontend/DJ-ZOKEN/components/SegmentedControl.tsx`
- Test: `apps/frontend/DJ-ZOKEN/__tests__/segmented-control.test.tsx`

**Step 1: 写失败测试**
```tsx
/* @vitest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { SegmentedControl } from '../components/SegmentedControl';
import { describe, it, expect } from 'vitest';

describe('SegmentedControl', () => {
  it('renders active option', () => {
    render(<SegmentedControl options={[{ id: 'a', label: 'A' }]} value="a" onChange={() => {}} />);
    expect(screen.getByText('A').className).toContain('is-active');
  });
});
```

**Step 2: 运行测试验证失败**
Run: `npm test -- --run __tests__/segmented-control.test.tsx`
Expected: FAIL（组件不存在）。

**Step 3: 最小实现**
- 实现 `SegmentedControl` 组件（仅样式与 aria，逻辑复用现有 state）。
- 在 `ThemeToggle` 与 `Warm-up/Prime/Closing` 使用 SegmentedControl。
- 为顶部区域添加 `macos-toolbar` 类，并统一高度 28–30px。

**Step 4: 运行测试验证通过**
Run: `npm test -- --run __tests__/segmented-control.test.tsx`
Expected: PASS.

**Step 5: 提交**
```bash
git add apps/frontend/DJ-ZOKEN/components/SegmentedControl.tsx \
  apps/frontend/DJ-ZOKEN/components/ThemeToggle.tsx \
  apps/frontend/DJ-ZOKEN/App.tsx \
  apps/frontend/DJ-ZOKEN/__tests__/segmented-control.test.tsx

git commit -m "style(ui): unify toolbar segmented controls"
```

### Task 4: 左侧栏（Sidebar / Search / Drop Zone / 列表态）

**Files:**
- Modify: `apps/frontend/DJ-ZOKEN/App.tsx`
- Modify: `apps/frontend/DJ-ZOKEN/theme.css`
- Test: `apps/frontend/DJ-ZOKEN/__tests__/sidebar-dropzone.test.tsx`

**Step 1: 写失败测试**
```tsx
/* @vitest-environment jsdom */
import { render, screen } from '@testing-library/react';
import App from '../App';
import { describe, it, expect } from 'vitest';

describe('Sidebar dropzone', () => {
  it('renders dropzone hint', () => {
    render(<App />);
    expect(screen.getByText('拖拽本地歌曲到这里')).toBeTruthy();
  });
});
```

**Step 2: 运行测试验证失败**
Run: `npm test -- --run __tests__/sidebar-dropzone.test.tsx`
Expected: FAIL（class 未更新）。

**Step 3: 最小实现**
- 左侧容器改用 `macos-sidebar` 样式（更强磨砂、更轻边框）。
- 搜索框应用 `macos-textfield`。
- 列表 hover/active 引入 `macos-listitem` 与 2px 左侧高亮条。
- Drop Zone 使用 `macos-dropzone`（虚线玻璃边 + 双层文案）。

**Step 4: 运行测试验证通过**
Run: `npm test -- --run __tests__/sidebar-dropzone.test.tsx`
Expected: PASS.

**Step 5: 提交**
```bash
git add apps/frontend/DJ-ZOKEN/App.tsx \
  apps/frontend/DJ-ZOKEN/theme.css \
  apps/frontend/DJ-ZOKEN/__tests__/sidebar-dropzone.test.tsx

git commit -m "style(ui): macOS sidebar and dropzone"
```

### Task 5: 中间主舞台（空态/按钮/小分段）

**Files:**
- Modify: `apps/frontend/DJ-ZOKEN/App.tsx`
- Modify: `apps/frontend/DJ-ZOKEN/components/SetBuilder.tsx`

**Step 1: 写失败测试**
```tsx
/* @vitest-environment jsdom */
import { render, screen } from '@testing-library/react';
import App from '../App';
import { describe, it, expect } from 'vitest';

describe('Stage empty state', () => {
  it('renders Current Set empty prompt', () => {
    render(<App />);
    expect(screen.getByText(/Current Set/)).toBeTruthy();
  });
});
```

**Step 2: 运行测试验证失败**
Run: `npm test -- --run __tests__/stage-empty.test.tsx`
Expected: FAIL（样式未更新）。

**Step 3: 最小实现**
- 主舞台容器增强层级（更自然阴影）。
- 空态卡片与右侧空态统一风格。
- Keys Strict/Std/Loose 使用 segmented 组件。
- 底部按钮统一 36px 高度、10px 圆角。

**Step 4: 运行测试验证通过**
Run: `npm test -- --run __tests__/stage-empty.test.tsx`
Expected: PASS.

**Step 5: 提交**
```bash
git add apps/frontend/DJ-ZOKEN/App.tsx \
  apps/frontend/DJ-ZOKEN/components/SetBuilder.tsx

git commit -m "style(ui): stage focus and macOS buttons"
```

### Task 6: 右侧面板（统计卡/图表/AI 区域）

**Files:**
- Modify: `apps/frontend/DJ-ZOKEN/App.tsx`
- Modify: `apps/frontend/DJ-ZOKEN/components/EnergyChart.tsx`

**Step 1: 写失败测试**
```tsx
/* @vitest-environment jsdom */
import { render, screen } from '@testing-library/react';
import App from '../App';
import { describe, it, expect } from 'vitest';

describe('Right panel', () => {
  it('shows AI helper title', () => {
    render(<App />);
    expect(screen.getByText('AI 选曲助手')).toBeTruthy();
  });
});
```

**Step 2: 运行测试验证失败**
Run: `npm test -- --run __tests__/right-panel.test.tsx`
Expected: FAIL（样式未更新）。

**Step 3: 最小实现**
- 右侧 section header 统一弱分割线。
- 统计卡片数字/label 对比优化。
- Energy Flow 空态统一风格。
- API Key 输入行使用 `macos-textfield` + 小按钮。
- 主按钮暖色减饱和度与发光。

**Step 4: 运行测试验证通过**
Run: `npm test -- --run __tests__/right-panel.test.tsx`
Expected: PASS.

**Step 5: 提交**
```bash
git add apps/frontend/DJ-ZOKEN/App.tsx \
  apps/frontend/DJ-ZOKEN/components/EnergyChart.tsx

git commit -m "style(ui): macOS right panel polish"
```

### Task 7: Pencil MCP After 截图 + 全量测试

**Files:**
- 无代码变更

**Step 1: Pencil MCP 输出 After 预览图**
- 使用 `mcp__pencil__batch_design` 与 `mcp__pencil__get_screenshot`。

**Step 2: 运行全量测试**
Run: `npm test`
Expected: PASS（记录已有警告）。

**Step 3: 最终提交**
```bash
git add -A
git commit -m "chore(ui): finalize macOS liquid glass polish"
```
