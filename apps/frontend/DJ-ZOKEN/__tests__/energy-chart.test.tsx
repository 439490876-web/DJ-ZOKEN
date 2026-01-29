/* @vitest-environment jsdom */
import { describe, it, expect, beforeAll } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import EnergyChart from '../components/EnergyChart'
import { Track } from '../types'

const tracks: Track[] = [
  {
    id: 't1',
    title: 'Sunset Drive',
    artist: 'DJ Nova',
    bpm: 122,
    key: '8A',
    energy: 6,
    resonance: 4,
    heatStatus: 'ok',
    genre: 'House',
    duration: '03:30',
  },
  {
    id: 't2',
    title: 'Golden Hour',
    artist: 'DJ Nova',
    bpm: 126,
    key: '9A',
    energy: 8,
    resonance: 8,
    heatStatus: 'ok',
    genre: 'House',
    duration: '04:10',
  },
  {
    id: 't3',
    title: 'Deep Glow',
    artist: 'DJ Nova',
    bpm: 118,
    key: '7A',
    energy: 5,
    resonance: 2,
    heatStatus: 'ok',
    genre: 'House',
    duration: '02:55',
  },
]

beforeAll(() => {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  ;(globalThis as any).ResizeObserver = ResizeObserverMock

  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      width: 800,
      height: 220,
      top: 0,
      left: 0,
      right: 800,
      bottom: 220,
    }),
  })
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get() {
      return 800
    },
  })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get() {
      return 220
    },
  })
})

describe('EnergyChart', () => {
  it('renders segmented energy curve paths', async () => {
    const { container } = render(<EnergyChart tracks={tracks} />)

    await waitFor(() => {
      const paths = container.querySelectorAll('.recharts-customized-wrapper path')
      expect(paths.length).toBeGreaterThan(0)
    })
  })
})
