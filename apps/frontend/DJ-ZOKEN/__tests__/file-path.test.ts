import { describe, it, expect } from 'vitest'
import { getFilePath, attachFilePath } from '../services/filePath'

describe('filePath helpers', () => {
  it('getFilePath returns file.path when present', () => {
    const file = { path: '/Users/test.mp3' } as any
    expect(getFilePath(file)).toBe('/Users/test.mp3')
  })

  it('attachFilePath adds filePath when available', () => {
    const file = { path: '/Users/test.mp3' } as any
    const track = { id: 't1', title: 'x' } as any
    const result = attachFilePath(track, file)
    expect(result.filePath).toBe('/Users/test.mp3')
  })

  it('attachFilePath leaves track unchanged when no path', () => {
    const file = {} as any
    const track = { id: 't1', title: 'x', filePath: null } as any
    const result = attachFilePath(track, file)
    expect(result.filePath).toBeNull()
  })
})
