# Rekordbox 固定 XML（ZOKEN SETGPT）实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 导出 Rekordbox 时只维护一个固定 XML（ZOKEN SETGPT.xml），并在其中累积追加多个 playlist（历史 set 保留）。

**Architecture:** 读取现有 XML → COLLECTION 去重追加 → PLAYLISTS 增量追加 → 写回固定路径。

**Tech Stack:** Electron (main/preload), Node.js, React, TypeScript

---

### Task 1: 固定 XML 路径与写回策略

**Files:**
- Modify: `apps/desktop/src/export/rekordbox.ts`
- Modify: `apps/desktop/src/export/rekordbox.js`
- Test: `apps/desktop/test/rekordbox-export.test.js`

**Step 1: Write the failing test**

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const os = require('node:os')

const { exportToRekordbox } = require('../src/export/rekordbox')

test('exportToRekordbox writes to fixed ZOKEN SETGPT.xml path', async () => {
  const outDir = path.join(os.tmpdir(), 'rekordbox-fixed')
  const result = await exportToRekordbox({
    setName: 'Test Set',
    filePaths: ['/tmp/a.mp3'],
    trackMeta: [{ name: 'Song A', artist: 'Artist A' }],
    outputDir: outDir,
  })
  assert.ok(result.xmlPath.endsWith('ZOKEN SETGPT.xml'))
})
```

**Step 2: Run test to verify it fails**

Run: `node --test test/rekordbox-export.test.js`
Expected: FAIL

**Step 3: Implement fixed filename**

- 固定文件名 `ZOKEN SETGPT.xml`
- outputDir 仍可覆盖，但文件名固定

**Step 4: Run test to verify it passes**

Run: `node --test test/rekordbox-export.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/desktop/src/export/rekordbox.ts apps/desktop/src/export/rekordbox.js apps/desktop/test/rekordbox-export.test.js
git commit -m "feat(desktop): export fixed ZOKEN SETGPT.xml"
```

---

### Task 2: XML 解析 + COLLECTION 去重追加

**Files:**
- Modify: `apps/desktop/src/export/rekordboxXml.ts`
- Modify: `apps/desktop/src/export/rekordboxXml.js`
- Create: `apps/desktop/src/export/rekordboxXmlMerge.ts`
- Test: `apps/desktop/test/rekordbox-xml-merge.test.js`

**Step 1: Write failing test**

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const { mergeRekordboxXml } = require('../src/export/rekordboxXmlMerge')

const baseXml = `<?xml version="1.0" encoding="UTF-8"?>\n<DJ_PLAYLISTS Version="1.0.0">\n  <PRODUCT Name="rekordbox" Version="7.x" Company="AlphaTheta"/>\n  <COLLECTION Entries="1">\n    <TRACK TrackID="1" Name="A" Artist="B" Location="file://localhost/tmp/a.mp3" />\n  </COLLECTION>\n  <PLAYLISTS>\n    <NODE Type="0" Name="DJ-ZOKEN"></NODE>\n  </PLAYLISTS>\n</DJ_PLAYLISTS>\n`

test('mergeRekordboxXml reuses TrackID for existing Location', () => {
  const result = mergeRekordboxXml(baseXml, {
    setName: 'Set 2',
    tracks: [{ id: 'x', name: 'A', artist: 'B', location: '/tmp/a.mp3' }],
  })
  assert.ok(result.xml.includes('TrackID="1"'))
  assert.ok(result.xml.includes('<TRACK Key="1"'))
})
```

**Step 2: Run test to verify it fails**

Run: `node --test test/rekordbox-xml-merge.test.js`
Expected: FAIL

**Step 3: Minimal implementation**

- 解析 XML（DOMParser 或 fast-xml-parser）
- COLLECTION 以 Location 为唯一键去重
- 新 TrackID = max + 1

**Step 4: Run test to verify it passes**

Run: `node --test test/rekordbox-xml-merge.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/desktop/src/export/rekordboxXmlMerge.ts apps/desktop/test/rekordbox-xml-merge.test.js
 git commit -m "feat(desktop): merge rekordbox xml collection"
```

---

### Task 3: PLAYLIST 自动重命名追加

**Files:**
- Modify: `apps/desktop/src/export/rekordboxXmlMerge.ts`
- Test: `apps/desktop/test/rekordbox-xml-merge.test.js`

**Step 1: Add failing test**

```js
test('mergeRekordboxXml auto renames duplicate playlist', () => {
  const baseXml = `<?xml version="1.0" encoding="UTF-8"?>\n<DJ_PLAYLISTS Version="1.0.0">\n  <PRODUCT Name="rekordbox" Version="7.x" Company="AlphaTheta"/>\n  <COLLECTION Entries="0"></COLLECTION>\n  <PLAYLISTS>\n    <NODE Type="0" Name="DJ-ZOKEN">\n      <NODE Type="1" Name="My Set"></NODE>\n    </NODE>\n  </PLAYLISTS>\n</DJ_PLAYLISTS>\n`

  const result = mergeRekordboxXml(baseXml, {
    setName: 'My Set',
    tracks: [{ id: 't1', name: 'Song', artist: 'Artist', location: '/tmp/a.mp3' }],
  })
  assert.ok(result.xml.includes('Name="My Set (2)"'))
})
```

**Step 2: Run test to verify it fails**

Run: `node --test test/rekordbox-xml-merge.test.js`
Expected: FAIL

**Step 3: Implement rename logic**

- 查找 `DJ-ZOKEN` 下所有 playlist 名称
- 若冲突，追加 `(2)/(3)`

**Step 4: Run test to verify it passes**

Run: `node --test test/rekordbox-xml-merge.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/desktop/src/export/rekordboxXmlMerge.ts apps/desktop/test/rekordbox-xml-merge.test.js
 git commit -m "feat(desktop): auto rename duplicate rekordbox playlists"
```

---

### Task 4: 导出流程接入 merge

**Files:**
- Modify: `apps/desktop/src/export/rekordbox.ts`
- Modify: `apps/desktop/src/export/rekordbox.js`

**Step 1: Implement merge**

- 若 XML 存在：读取并传入 mergeRekordboxXml
- 若不存在：用 buildRekordboxXml 生成初始文件

**Step 2: Manual verify**

Run: `node --test test/rekordbox-export.test.js`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/desktop/src/export/rekordbox.ts apps/desktop/src/export/rekordbox.js
 git commit -m "feat(desktop): append rekordbox xml instead of overwriting"
```

---

### Task 5: 前端导出提示更新

**Files:**
- Modify: `apps/frontend/DJ-ZOKEN/components/ExportDialog.tsx`

**Step 1: Update hint text**

- 提示：固定 XML 文件，导入一次后后续刷新即可

**Step 2: Manual verify**

Run: `npm test -- __tests__/export-dialog.test.tsx`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/frontend/DJ-ZOKEN/components/ExportDialog.tsx
 git commit -m "feat(frontend): update rekordbox import hints for fixed xml"
```

---

**Plan complete and saved to `docs/plans/2026-01-28-rekordbox-xml-export-accumulate-implementation-plan.md`. Two execution options:**

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**

