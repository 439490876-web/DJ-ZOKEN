/* @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from '../App'

const cachedTrack = {
  id: 't1',
  title: 'Song A',
  artist: 'Artist A',
  bpm: 120,
  key: '1A',
  energy: 6,
  resonance: 6,
  genre: null,
  duration: '03:00',
  filePath: '/tmp/a.mp3',
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (input) => {
    if (typeof input === 'string' && input.startsWith('/api/setlists')) {
      return {
        ok: true,
        json: async () => ({ ok: true, setlists: [] }),
      }
    }
    return { ok: true, json: async () => ({}) }
  }))

  window.localStorage.setItem(
    'dj_library_cache_v1',
    JSON.stringify({
      library: [cachedTrack],
      libraryOrder: [cachedTrack.id],
    })
  )
})

afterEach(() => {
  window.localStorage.clear()
  vi.unstubAllGlobals()
})

describe('Export button', () => {
  it('is disabled when no tracks in current set', async () => {
    render(<App />)
    const button = await screen.findByRole('button', { name: '导出' })
    expect(button).toBeDisabled()
  })
})
