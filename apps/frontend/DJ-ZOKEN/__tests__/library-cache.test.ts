import { describe, it, expect } from 'vitest'
import { createLibraryCache } from '../services/libraryCache'

describe('library cache', () => {
  it('saves and loads library payload', () => {
    const store = new Map<string, string>()
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k)
    } as Storage

    const cache = createLibraryCache(storage)
    const payload = { library: [{ id: '1', title: 'x' }], libraryOrder: ['1'] }
    cache.save(payload)
    expect(cache.load()).toEqual(payload)
  })
})
