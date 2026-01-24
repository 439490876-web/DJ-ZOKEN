# 曲库持久化缓存 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 刷新后立即恢复曲库完整信息（含分析结果与封面），无需重新解析。

**Architecture:** localStorage 存曲库主数据与顺序；IndexedDB 存封面 Blob。启动先渲染 localStorage，再异步补齐封面。

**Tech Stack:** React + Vite + Vitest + IndexedDB (fake-indexeddb for tests)

---

### Task 1: 生成 coverKey 与 Track 字段扩展

**Files:**
- Modify: `apps/frontend/DJ-ZOKEN/types.ts`
- Create: `apps/frontend/DJ-ZOKEN/services/coverKey.ts`
- Test: `apps/frontend/DJ-ZOKEN/__tests__/cover-key.test.ts`

**Step 1: 写失败测试**

```ts
// apps/frontend/DJ-ZOKEN/__tests__/cover-key.test.ts
import { describe, it, expect } from 'vitest'
import { buildCoverKey } from '../services/coverKey'

describe('buildCoverKey', () => {
  it('prefers file signature when available', () => {
    const file = { name: 'a.mp3', size: 100, lastModified: 123 } as any
    expect(buildCoverKey(file, null)).toBe('a.mp3:100:123')
  })

  it('falls back to filePath when signature missing', () => {
    const file = { name: '', size: 0, lastModified: 0 } as any
    expect(buildCoverKey(file, '/Users/a.mp3')).toBe('path:/Users/a.mp3')
  })
})
```

**Step 2: 运行测试，确认失败**

Run: `cd apps/frontend/DJ-ZOKEN && npm test`
Expected: FAIL（buildCoverKey 未实现）

**Step 3: 最小实现**

```ts
// apps/frontend/DJ-ZOKEN/services/coverKey.ts
export const buildCoverKey = (
  file: { name?: string; size?: number; lastModified?: number },
  filePath?: string | null
) => {
  const hasSignature = file?.name && file?.size && file?.lastModified
  if (hasSignature) {
    return `${file.name}:${file.size}:${file.lastModified}`
  }
  if (filePath) {
    return `path:${filePath}`
  }
  return null
}
```

- `types.ts` 中为 Track 添加 `coverKey?: string | null`

**Step 4: 运行测试，确认通过**

Run: `cd apps/frontend/DJ-ZOKEN && npm test`
Expected: PASS

**Step 5: 提交**

```bash
git add apps/frontend/DJ-ZOKEN/types.ts apps/frontend/DJ-ZOKEN/services/coverKey.ts apps/frontend/DJ-ZOKEN/__tests__/cover-key.test.ts

git commit -m "feat(frontend): add cover key builder"
```

---

### Task 2: localStorage 曲库缓存服务

**Files:**
- Create: `apps/frontend/DJ-ZOKEN/services/libraryCache.ts`
- Test: `apps/frontend/DJ-ZOKEN/__tests__/library-cache.test.ts`

**Step 1: 写失败测试**

```ts
// apps/frontend/DJ-ZOKEN/__tests__/library-cache.test.ts
import { describe, it, expect } from 'vitest'
import { createLibraryCache } from '../services/libraryCache'

describe('library cache', () => {
  it('saves and loads library payload', () => {
    const store = new Map<string, string>()
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k)
    }
    const cache = createLibraryCache(storage)
    const payload = { library: [{ id: '1', title: 'x' }], libraryOrder: ['1'] }
    cache.save(payload)
    expect(cache.load()).toEqual(payload)
  })
})
```

**Step 2: 运行测试，确认失败**

Run: `cd apps/frontend/DJ-ZOKEN && npm test`
Expected: FAIL（createLibraryCache 未实现）

**Step 3: 最小实现**

```ts
// apps/frontend/DJ-ZOKEN/services/libraryCache.ts
const CACHE_KEY = 'dj_library_cache_v1'

export const createLibraryCache = (storage: Storage) => {
  return {
    load: () => {
      try {
        const raw = storage.getItem(CACHE_KEY)
        return raw ? JSON.parse(raw) : null
      } catch {
        return null
      }
    },
    save: (payload: unknown) => {
      storage.setItem(CACHE_KEY, JSON.stringify(payload))
    },
    clear: () => storage.removeItem(CACHE_KEY)
  }
}
```

**Step 4: 运行测试，确认通过**

Run: `cd apps/frontend/DJ-ZOKEN && npm test`
Expected: PASS

**Step 5: 提交**

```bash
git add apps/frontend/DJ-ZOKEN/services/libraryCache.ts apps/frontend/DJ-ZOKEN/__tests__/library-cache.test.ts

git commit -m "feat(frontend): add library cache service"
```

---

### Task 3: IndexedDB 封面缓存服务

**Files:**
- Create: `apps/frontend/DJ-ZOKEN/services/coverCache.ts`
- Test: `apps/frontend/DJ-ZOKEN/__tests__/cover-cache.test.ts`
- Modify: `apps/frontend/DJ-ZOKEN/package.json`

**Step 1: 写失败测试**

```ts
// apps/frontend/DJ-ZOKEN/__tests__/cover-cache.test.ts
import { describe, it, expect } from 'vitest'
import { indexedDB as fakeIndexedDB } from 'fake-indexeddb'
import { createCoverCache } from '../services/coverCache'

describe('cover cache', async () => {
  it('stores and reads blob', async () => {
    const cache = createCoverCache(fakeIndexedDB)
    const blob = new Blob(['x'], { type: 'image/png' })
    await cache.put('k1', blob)
    const read = await cache.get('k1')
    expect(read?.size).toBe(1)
  })
})
```

**Step 2: 运行测试，确认失败**

Run: `cd apps/frontend/DJ-ZOKEN && npm test`
Expected: FAIL（coverCache 未实现或 fake-indexeddb 未安装）

**Step 3: 最小实现**
- 安装 devDependency: `fake-indexeddb`

```ts
// apps/frontend/DJ-ZOKEN/services/coverCache.ts
const DB_NAME = 'dj_cache_v1'
const STORE = 'covers'

export const createCoverCache = (idb: IDBFactory) => {
  const open = () => new Promise<IDBDatabase>((resolve, reject) => {
    const req = idb.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })

  const withStore = async <T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => void) => {
    const db = await open()
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const store = tx.objectStore(STORE)
      const result = fn(store)
      tx.oncomplete = () => resolve(result as T)
      tx.onerror = () => reject(tx.error)
    })
  }

  return {
    put: async (key: string, blob: Blob) => {
      await withStore('readwrite', store => store.put(blob, key))
    },
    get: async (key: string) => {
      return await withStore<Blob | null>('readonly', store => store.get(key) as any)
    },
    clear: async () => {
      await withStore('readwrite', store => store.clear())
    }
  }
}
```

**Step 4: 运行测试，确认通过**

Run: `cd apps/frontend/DJ-ZOKEN && npm test`
Expected: PASS

**Step 5: 提交**

```bash
git add apps/frontend/DJ-ZOKEN/services/coverCache.ts apps/frontend/DJ-ZOKEN/__tests__/cover-cache.test.ts apps/frontend/DJ-ZOKEN/package.json apps/frontend/DJ-ZOKEN/package-lock.json

git commit -m "feat(frontend): add cover cache service"
```

---

### Task 4: 曲库恢复与封面回填辅助函数

**Files:**
- Create: `apps/frontend/DJ-ZOKEN/services/libraryHydration.ts`
- Test: `apps/frontend/DJ-ZOKEN/__tests__/library-hydration.test.ts`

**Step 1: 写失败测试**

```ts
// apps/frontend/DJ-ZOKEN/__tests__/library-hydration.test.ts
import { describe, it, expect } from 'vitest'
import { hydrateCoverUrls } from '../services/libraryHydration'

describe('hydrateCoverUrls', () => {
  it('fills coverUrl from cover cache', async () => {
    const library = [{ id: '1', coverKey: 'k1' }]
    const coverCache = { get: async () => new Blob(['x']) }
    const result = await hydrateCoverUrls(library as any, coverCache as any, () => 'blob:1')
    expect(result[0].coverUrl).toBe('blob:1')
  })
})
```

**Step 2: 运行测试，确认失败**

Run: `cd apps/frontend/DJ-ZOKEN && npm test`
Expected: FAIL（hydrateCoverUrls 未实现）

**Step 3: 最小实现**

```ts
// apps/frontend/DJ-ZOKEN/services/libraryHydration.ts
export const hydrateCoverUrls = async (
  library: Array<{ coverKey?: string | null; coverUrl?: string | null }>,
  coverCache: { get: (key: string) => Promise<Blob | null> },
  makeObjectUrl: (blob: Blob) => string
) => {
  const next = [...library]
  for (let i = 0; i < next.length; i += 1) {
    const key = next[i].coverKey
    if (key && !next[i].coverUrl) {
      const blob = await coverCache.get(key)
      if (blob) {
        next[i] = { ...next[i], coverUrl: makeObjectUrl(blob) }
      }
    }
  }
  return next
}
```

**Step 4: 运行测试，确认通过**

Run: `cd apps/frontend/DJ-ZOKEN && npm test`
Expected: PASS

**Step 5: 提交**

```bash
git add apps/frontend/DJ-ZOKEN/services/libraryHydration.ts apps/frontend/DJ-ZOKEN/__tests__/library-hydration.test.ts

git commit -m "feat(frontend): add library hydration helper"
```

---

### Task 5: App 集成缓存与清除入口

**Files:**
- Modify: `apps/frontend/DJ-ZOKEN/App.tsx`

**Step 1: 写失败测试（纯函数）**

```ts
// apps/frontend/DJ-ZOKEN/__tests__/library-hydration.test.ts
// 增加一个测试，保证当 coverUrl 已存在时不会被覆盖
it('does not override existing coverUrl', async () => {
  const library = [{ id: '1', coverKey: 'k1', coverUrl: 'keep' }]
  const coverCache = { get: async () => new Blob(['x']) }
  const result = await hydrateCoverUrls(library as any, coverCache as any, () => 'blob:1')
  expect(result[0].coverUrl).toBe('keep')
})
```

**Step 2: 运行测试，确认失败**

Run: `cd apps/frontend/DJ-ZOKEN && npm test`
Expected: FAIL（hydrateCoverUrls 未处理覆盖逻辑）

**Step 3: 最小实现**
- 更新 `hydrateCoverUrls`：若已有 `coverUrl`，不覆盖。
- `App.tsx` 集成：
  - 初始化时 `createLibraryCache(window.localStorage).load()`，若有缓存则直接 `setLibrary`。
  - 启动后异步调用 `hydrateCoverUrls`，回填封面。
  - 任意 `library` 变化时调用 `save`（自动写入）。
  - 提供“清除缓存”按钮：清空 localStorage + IndexedDB，并清空库。

**Step 4: 运行测试，确认通过**

Run: `cd apps/frontend/DJ-ZOKEN && npm test`
Expected: PASS

**Step 5: 提交**

```bash
git add apps/frontend/DJ-ZOKEN/App.tsx apps/frontend/DJ-ZOKEN/services/libraryHydration.ts apps/frontend/DJ-ZOKEN/__tests__/library-hydration.test.ts

git commit -m "feat(frontend): integrate library cache"
```

---

## 说明
- 所有缓存写入为自动触发。
- 不缓存音频本体。
- 封面仅在 `coverKey` 存在时回填。
