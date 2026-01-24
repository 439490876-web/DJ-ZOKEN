import { describe, it, expect } from 'vitest'
import { buildExportPayload, getMissingFilePaths } from '../services/exportService'

describe('buildExportPayload', () => {
  it('filters empty paths', () => {
    const payload = buildExportPayload('serato', 'My Set', ['a', '', null as any])
    expect(payload.filePaths.length).toBe(1)
  })

  it('detects missing file paths', () => {
    const missing = getMissingFilePaths(['a', '', null as any, undefined])
    expect(missing.length).toBe(3)
  })
})
