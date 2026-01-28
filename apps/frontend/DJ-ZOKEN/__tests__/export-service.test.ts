import { describe, it, expect } from 'vitest'
import { buildExportPayload, getMissingFilePaths } from '../services/exportService'

const tracks = [
  { title: 'Song A', artist: 'Artist A', album: 'Album A', bpm: 120, key: '1A' },
  { title: 'Song B', artist: 'Artist B', album: null, bpm: null, key: null },
]

describe('buildExportPayload', () => {
  it('filters empty paths and keeps trackMeta aligned', () => {
    const payload = buildExportPayload('serato', 'My Set', ['a', '', null as any], tracks as any)
    expect(payload.filePaths.length).toBe(1)
    expect(payload.trackMeta?.length).toBe(1)
    expect(payload.trackMeta?.[0]?.name).toBe('Song A')
  })

  it('detects missing file paths', () => {
    const missing = getMissingFilePaths(['a', '', null as any, undefined])
    expect(missing.length).toBe(3)
  })
})
