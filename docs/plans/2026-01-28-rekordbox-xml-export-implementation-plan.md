# Rekordbox XML Export Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 实现 Rekordbox XML 导出（方案 A）：生成 XML + 打开 Rekordbox + Finder 定位文件，并在前端显示导出路径与导入提示。

**Architecture:** 前端发起 export:set IPC → 桌面端生成 XML 文件并返回 xmlPath → 桌面端调用 `open -a rekordbox` 与 `open -R <xml>` → 前端展示导入提示。

**Tech Stack:** Electron (main/preload), TypeScript, Node.js, React (frontend), Vitest

---

### Task 1: Rekordbox XML 生成器（最小可用）

**Files:**
- Create: `apps/desktop/src/export/rekordboxXml.ts`
- Test: `apps/desktop/test/rekordboxXml.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { buildRekordboxXml } from '../src/export/rekordboxXml';

describe('buildRekordboxXml', () => {
  it('writes collection and playlist nodes', () => {
    const xml = buildRekordboxXml({
      setName: 'Test Set',
      tracks: [
        { id: 't1', name: 'Song A', artist: 'Artist A', location: '/tmp/a.mp3' },
        { id: 't2', name: 'Song B', artist: 'Artist B', location: '/tmp/b.mp3' }
      ]
    });
    expect(xml).toContain('<COLLECTION');
    expect(xml).toContain('TrackID="1"');
    expect(xml).toContain('Location="file://');
    expect(xml).toContain('<NODE Type="1" Name="Test Set"');
    expect(xml).toContain('<TRACK Key="1"');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- test/rekordboxXml.test.ts`
Expected: FAIL (module not found)

**Step 3: Write minimal implementation**

```ts
export type RekordboxTrack = {
  id: string;
  name: string;
  artist: string;
  album?: string | null;
  bpm?: number | null;
  key?: string | null;
  location: string; // absolute path
};

type BuildInput = { setName: string; tracks: RekordboxTrack[] };

const toFileUrl = (path: string) => `file://${encodeURI(path)}`;

export const buildRekordboxXml = ({ setName, tracks }: BuildInput): string => {
  const collection = tracks
    .map((t, idx) => {
      const trackId = idx + 1;
      const attrs = [
        `TrackID=\"${trackId}\"`,
        `Name=\"${escapeXml(t.name)}\"`,
        `Artist=\"${escapeXml(t.artist)}\"`,
        `Location=\"${toFileUrl(t.location)}\"`
      ];
      if (t.album) attrs.push(`Album=\"${escapeXml(t.album)}\"`);
      if (typeof t.bpm === 'number') attrs.push(`BPM=\"${t.bpm}\"`);
      if (t.key) attrs.push(`Key=\"${escapeXml(t.key)}\"`);
      return `    <TRACK ${attrs.join(' ')} />`;
    })
    .join('\n');

  const playlistItems = tracks
    .map((_, idx) => `        <TRACK Key=\"${idx + 1}\" />`)
    .join('\n');

  return `<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<DJ_PLAYLISTS Version=\"1.0.0\">\n  <PRODUCT Name=\"rekordbox\" Version=\"7.x\" Company=\"AlphaTheta\"/>\n  <COLLECTION Entries=\"${tracks.length}\">\n${collection}\n  </COLLECTION>\n  <PLAYLISTS>\n    <NODE Type=\"0\" Name=\"DJ-ZOKEN\">\n      <NODE Type=\"1\" Name=\"${escapeXml(setName)}\">\n${playlistItems}\n      </NODE>\n    </NODE>\n  </PLAYLISTS>\n</DJ_PLAYLISTS>\n`;
};

const escapeXml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
```

**Step 4: Run test to verify it passes**

Run: `npm test -- test/rekordboxXml.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/desktop/src/export/rekordboxXml.ts apps/desktop/test/rekordboxXml.test.ts
git commit -m "feat(desktop): add rekordbox xml builder"
```

---

### Task 2: Rekordbox 导出落盘 + 打开应用 + Finder 定位

**Files:**
- Modify: `apps/desktop/src/export/rekordbox.ts`
- Modify: `apps/desktop/src/main.js`
- Test: `apps/desktop/test/rekordboxExport.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from 'vitest';
import { exportToRekordbox } from '../src/export/rekordbox';

vi.mock('node:fs');
vi.mock('node:child_process');

describe('exportToRekordbox', () => {
  it('returns xmlPath', async () => {
    const result = await exportToRekordbox({
      setName: 'Test Set',
      filePaths: ['/tmp/a.mp3'],
      trackMeta: [{ name: 'Song A', artist: 'Artist A' }]
    });
    expect(result.xmlPath).toContain('Test Set');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- test/rekordboxExport.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

- 使用 `rekordboxXml.ts` 生成 XML
- 输出到 `~/Documents/DJ-ZOKEN/Exports/rekordbox/<setName>.xml`
- `open -a "rekordbox"` 与 `open -R <xmlPath>`
- 返回 `{ ok: true, xmlPath }`

**Step 4: Run test to verify it passes**

Run: `npm test -- test/rekordboxExport.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/desktop/src/export/rekordbox.ts apps/desktop/src/main.js apps/desktop/test/rekordboxExport.test.ts
git commit -m "feat(desktop): export rekordbox xml and open file"
```

---

### Task 3: 前端展示导出结果 + 导入提示

**Files:**
- Modify: `apps/frontend/DJ-ZOKEN/components/ExportDialog.tsx`
- Test: `apps/frontend/DJ-ZOKEN/__tests__/export-dialog.test.tsx`

**Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react';
import { ExportDialog } from '../components/ExportDialog';

test('shows rekordbox xml path on success', () => {
  render(<ExportDialog open onClose={() => {}} onConfirm={async () => ({ ok: true, xmlPath: '/tmp/test.xml' })} />);
  expect(screen.getByText(/test.xml/)).toBeTruthy();
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- __tests__/export-dialog.test.tsx`
Expected: FAIL

**Step 3: Write minimal implementation**

- 导出成功后显示 `xmlPath`
- 显示两步导入提示

**Step 4: Run test to verify it passes**

Run: `npm test -- __tests__/export-dialog.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/frontend/DJ-ZOKEN/components/ExportDialog.tsx apps/frontend/DJ-ZOKEN/__tests__/export-dialog.test.tsx
git commit -m "feat(frontend): show rekordbox xml path and import hint"
```

---

### Task 4: 回归测试与验证

**Step 1: 启动栈**

Run: `bash ~/.codex/skills/dev-stack-runner/scripts/start_stack.sh`

**Step 2: Electron 启动**

Run:
```bash
cd /Users/apple/work/NEWSETki/.worktrees/set-export/apps/desktop
env -u ELECTRON_RUN_AS_NODE ELECTRON_RENDERER_URL=http://localhost:3004 SERATO_DIR="$HOME/Music/_Serato_" nohup ./node_modules/electron/dist/Electron.app/Contents/MacOS/Electron . > /tmp/desktop-dev.log 2>&1 &
```

**Step 3: 验证导出**
- 导出后检查 XML 文件是否存在
- Finder 是否定位到 XML
- 前端是否显示导出路径与导入提示

---

Plan complete and saved to `docs/plans/2026-01-28-rekordbox-xml-export-implementation-plan.md`.

Two execution options:

1) **Subagent-Driven (this session)** — I dispatch fresh subagent per task, review between tasks, fast iteration
2) **Parallel Session (separate)** — Open new session with executing-plans, batch execution with checkpoints

Which approach?
