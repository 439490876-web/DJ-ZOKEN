import { describe, it, expect } from 'vitest'
import { hydrateCoverUrls } from '../services/libraryHydration'

describe('hydrateCoverUrls', () => {
  it('fills coverUrl from cover cache', async () => {
    const library = [{ id: '1', coverKey: 'k1' }]
    const coverCache = { get: async () => new Blob(['x']) }
    const result = await hydrateCoverUrls(library as any, coverCache as any, () => 'blob:1')
    expect(result[0].coverUrl).toBe('blob:1')
  })

  it('does not override existing coverUrl', async () => {
    const library = [{ id: '1', coverKey: 'k1', coverUrl: 'keep' }]
    const coverCache = { get: async () => new Blob(['x']) }
    const result = await hydrateCoverUrls(library as any, coverCache as any, () => 'blob:1')
    expect(result[0].coverUrl).toBe('keep')
  })
})
