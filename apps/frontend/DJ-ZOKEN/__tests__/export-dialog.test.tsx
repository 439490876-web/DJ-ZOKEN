/* @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ExportDialog } from '../components/ExportDialog'
import { Track } from '../types'

describe('ExportDialog', () => {
  const baseTrack: Track = {
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

  it('confirms export payload with selected target and set name', async () => {
    const onConfirm = vi.fn()
    const onClose = vi.fn()
    const user = userEvent.setup()

    render(
      <ExportDialog
        open
        onClose={onClose}
        onConfirm={onConfirm}
        currentTracks={[baseTrack]}
        savedSets={[]}
        defaultSetName="My Set"
      />
    )

    await user.click(screen.getByLabelText('Rekordbox'))
    const nameInput = screen.getByLabelText('Set 名称')
    await user.clear(nameInput)
    await user.type(nameInput, 'Friday Set')

    await user.click(screen.getByRole('button', { name: '确认导出' }))

    expect(onConfirm).toHaveBeenCalledWith({
      target: 'rekordbox',
      setName: 'Friday Set',
      filePaths: ['/tmp/a.mp3'],
      trackMeta: [
        { name: 'Song A', artist: 'Artist A', album: null, bpm: 120, key: '1A' },
      ],
    })
  })


  it('shows rekordbox xml path on success', () => {
    render(
      <ExportDialog
        open
        onClose={() => {}}
        onConfirm={() => {}}
        currentTracks={[baseTrack]}
        savedSets={[]}
        defaultSetName="My Set"
        success="导出成功"
        successPath="/tmp/test.xml"
        successTarget="rekordbox"
      />
    )

    expect(screen.getByText(/test\.xml/)).toBeTruthy()
    expect(screen.getByText('Rekordbox 导入提示')).toBeTruthy()
  })

  it('shows missing file paths warning', () => {
    const trackMissing: Track = {
      ...baseTrack,
      id: 't2',
      filePath: null,
    }

    render(
      <ExportDialog
        open
        onClose={() => {}}
        onConfirm={() => {}}
        currentTracks={[baseTrack, trackMissing]}
        savedSets={[]}
        defaultSetName="My Set"
      />
    )

    expect(screen.getByText('缺少 1 首文件路径')).toBeTruthy()
  })
})
