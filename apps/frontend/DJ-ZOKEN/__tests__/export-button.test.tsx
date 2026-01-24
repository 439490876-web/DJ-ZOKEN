import { beforeEach, afterEach, describe, it, expect } from 'vitest'
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
})

describe('Export button', () => {
  it('is disabled when no tracks in current set', async () => {
    render(<App />)
    const button = await screen.findByRole('button', { name: '导出' })
    expect(button).toBeDisabled()
  })
})
