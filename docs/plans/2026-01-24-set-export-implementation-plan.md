# Set 一键导出（Serato / Rekordbox）实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在桌面版（Electron）中支持将“当前 Set / 已保存 Set”一键导出到 Serato 或 Rekordbox，并实现“导出后即时可见”。

**Architecture:** Electron 主进程负责文件系统与数据库写入；渲染进程负责 UI 与 Set 数据。拖入文件时获取绝对路径并缓存；导出通过 IPC 调用主进程执行 Serato/Rekordbox 适配器。

**Tech Stack:** Electron、Vite(现有前端)、Node.js、SQLite（Rekordbox master.db）。

---

### Task 1: 建立最小 Electron 壳（加载现有前端）

**Files:**
- Create: `apps/desktop/package.json`
- Create: `apps/desktop/src/main.ts`
- Create: `apps/desktop/src/preload.ts`
- Create: `apps/desktop/src/ipc.ts`

**Step 1: 写失败测试（验证 IPC contract 结构）**

```js
// apps/desktop/test/ipc-contract.test.js
import test from 'node:test'
import assert from 'node:assert/strict'
import { isExportPayload } from '../src/ipc.js'

test('isExportPayload rejects missing fields', () => {
  assert.equal(isExportPayload({}), false)
})

test('isExportPayload accepts valid payload', () => {
  assert.equal(isExportPayload({
    target: 'serato',
    setName: 'My Set',
    filePaths: ['/Users/a.mp3']
  }), true)
})
```

**Step 2: 运行测试，确认失败**

Run: `node --test apps/desktop/test/ipc-contract.test.js`
Expected: FAIL (isExportPayload 未实现)

**Step 3: 最小实现**

```ts
// apps/desktop/src/ipc.ts
export type ExportTarget = 'serato' | 'rekordbox'
export type ExportPayload = { target: ExportTarget; setName: string; filePaths: string[] }
export const isExportPayload = (value: any): value is ExportPayload => {
  return Boolean(value)
    && (value.target === 'serato' || value.target === 'rekordbox')
    && typeof value.setName === 'string'
    && Array.isArray(value.filePaths)
    && value.filePaths.every((p: any) => typeof p === 'string')
}
```

**Step 4: 运行测试，确认通过**

Run: `node --test apps/desktop/test/ipc-contract.test.js`
Expected: PASS

**Step 5: 提交**

```bash
git add apps/desktop

git commit -m "feat(desktop): scaffold ipc contract"
```

---

### Task 2: 前端捕获绝对路径并缓存

**Files:**
- Modify: `apps/frontend/DJ-ZOKEN/types.ts`
- Modify: `apps/frontend/DJ-ZOKEN/App.tsx`
- Test: `apps/frontend/DJ-ZOKEN/__tests__/file-path.test.ts`

**Step 1: 写失败测试（file.path 读取与缓存）**

```ts
// apps/frontend/DJ-ZOKEN/__tests__/file-path.test.ts
import { describe, it, expect } from 'vitest'
import { getFilePath } from '../services/filePath'

describe('getFilePath', () => {
  it('returns file.path when present', () => {
    const file = { path: '/Users/test.mp3' } as any
    expect(getFilePath(file)).toBe('/Users/test.mp3')
  })
})
```

**Step 2: 运行测试，确认失败**

Run: `cd apps/frontend/DJ-ZOKEN && npm test`
Expected: FAIL（缺少 vitest 与实现）

**Step 3: 最小实现**
- 安装 vitest（devDependency）
- 新增 `apps/frontend/DJ-ZOKEN/services/filePath.ts`：

```ts
export const getFilePath = (file: File & { path?: string }) => {
  return typeof file.path === 'string' ? file.path : null
}
```

- 在 `handleLocalFiles` 中把 `filePath` 写入 Track，并随缓存写入。

**Step 4: 运行测试，确认通过**

Run: `cd apps/frontend/DJ-ZOKEN && npm test`
Expected: PASS

**Step 5: 提交**

```bash
git add apps/frontend/DJ-ZOKEN

git commit -m "feat(frontend): capture file path in Electron"
```

---

### Task 3: 导出 UI 与 IPC 调用

**Files:**
- Modify: `apps/frontend/DJ-ZOKEN/App.tsx`
- Create: `apps/frontend/DJ-ZOKEN/services/exportService.ts`
- Test: `apps/frontend/DJ-ZOKEN/__tests__/export-service.test.ts`

**Step 1: 写失败测试**

```ts
// apps/frontend/DJ-ZOKEN/__tests__/export-service.test.ts
import { describe, it, expect } from 'vitest'
import { buildExportPayload } from '../services/exportService'

describe('buildExportPayload', () => {
  it('filters empty paths', () => {
    const payload = buildExportPayload('serato', 'My Set', ['a', '', null as any])
    expect(payload.filePaths.length).toBe(1)
  })
})
```

**Step 2: 运行测试，确认失败**

Run: `cd apps/frontend/DJ-ZOKEN && npm test`
Expected: FAIL（buildExportPayload 未实现）

**Step 3: 最小实现**
- `exportService.ts` 构建 IPC payload，并检测缺失路径。
- App.tsx 新增导出弹窗 UI（导出目标、导出对象、导出位置）。
- 调用 `window.electronAPI.exportSet(payload)`（由 preload 暴露）

**Step 4: 运行测试，确认通过**

Run: `cd apps/frontend/DJ-ZOKEN && npm test`
Expected: PASS

**Step 5: 提交**

```bash
git add apps/frontend/DJ-ZOKEN

git commit -m "feat(frontend): add export UI and payload"
```

---

### Task 4: Rekordbox 导出（SQLite）

**Files:**
- Create: `apps/desktop/src/export/rekordbox.ts`
- Create: `apps/desktop/test/rekordbox-export.test.js`

**Step 1: 写失败测试（基于临时 SQLite）**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { exportToRekordbox } from '../src/export/rekordbox.js'

// 使用临时 sqlite 文件创建最小表结构并验证写入
```

**Step 2: 运行测试，确认失败**

Run: `node --test apps/desktop/test/rekordbox-export.test.js`
Expected: FAIL（exportToRekordbox 未实现）

**Step 3: 最小实现**
- 使用 `better-sqlite3` 连接 master.db
- 事务写入 track + playlist + 关联表
- 若结构不匹配，抛出明确错误

**Step 4: 运行测试，确认通过**

Run: `node --test apps/desktop/test/rekordbox-export.test.js`
Expected: PASS

**Step 5: 提交**

```bash
git add apps/desktop

git commit -m "feat(desktop): rekordbox export adapter"
```

---

### Task 5: Serato 导出（crate + db）

**Files:**
- Create: `apps/desktop/src/export/serato.ts`
- Create: `apps/desktop/test/serato-export.test.js`

**Step 1: 写失败测试（crate 生成 + 结构验证）**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { exportToSerato } from '../src/export/serato.js'
```

**Step 2: 运行测试，确认失败**

Run: `node --test apps/desktop/test/serato-export.test.js`
Expected: FAIL

**Step 3: 最小实现**
- 生成 `.crate` 文件
- 如果存在 Serato DB/索引，写入对应记录（需结构探测）
- 写入前备份 `_Serato_` 目录关键文件

**Step 4: 运行测试，确认通过**

Run: `node --test apps/desktop/test/serato-export.test.js`
Expected: PASS

**Step 5: 提交**

```bash
git add apps/desktop

git commit -m "feat(desktop): serato export adapter"
```

---

### Task 6: 集成 IPC 与导出流程

**Files:**
- Modify: `apps/desktop/src/main.ts`
- Modify: `apps/desktop/src/preload.ts`
- Modify: `apps/desktop/src/ipc.ts`

**Step 1: 写失败测试（调用导出返回结果）**

```js
// apps/desktop/test/export-ipc.test.js
// 模拟调用 export handler 并断言成功/失败返回结构
```

**Step 2: 运行测试，确认失败**

Run: `node --test apps/desktop/test/export-ipc.test.js`
Expected: FAIL

**Step 3: 最小实现**
- 在主进程注册 `export:set` handler
- preload 暴露 `window.electronAPI.exportSet`
- 返回标准结果结构 `{ ok, message }`

**Step 4: 运行测试，确认通过**

Run: `node --test apps/desktop/test/export-ipc.test.js`
Expected: PASS

**Step 5: 提交**

```bash
git add apps/desktop

git commit -m "feat(desktop): wire export ipc"
```

---

### Task 7: 验证与文档

**Files:**
- Modify: `docs/plans/2026-01-24-set-export-design.md`
- Create: `docs/ops/set-export-macos.md`

**Step 1: 写说明文档（中文）**
- 说明导出入口、导出目标、即时出现策略、回滚方式

**Step 2: 本地验证步骤**
- 导入一组歌曲 → 生成 Set → 导出到 Serato / Rekordbox → 立即出现

**Step 3: 提交**

```bash
git add docs

git commit -m "docs: add set export usage"
```

---

## 说明与前置条件
- 需要 Electron 环境与 Node 18+。
- Rekordbox DB 结构可能随版本变化，需在实现阶段根据本机版本调整表名与字段。
- Serato 数据结构需要先探测文件结构（可能需用户授权）。

