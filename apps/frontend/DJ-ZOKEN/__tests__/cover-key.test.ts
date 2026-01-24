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
