import { describe, it, expect } from 'vitest'
import { indexedDB as fakeIndexedDB } from 'fake-indexeddb'
import { createCoverCache } from '../services/coverCache'

describe('cover cache', () => {
  it('stores and reads blob', async () => {
    const cache = createCoverCache(fakeIndexedDB)
    const blob = new Blob(['x'], { type: 'image/png' })
    await cache.put('k1', blob)
    const read = await cache.get('k1')
    expect(read?.size).toBe(1)
  })
})
