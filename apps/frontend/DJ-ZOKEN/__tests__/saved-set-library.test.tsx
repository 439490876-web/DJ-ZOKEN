/* @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SavedSetLibrary } from '../components/SavedSetLibrary'
import { SetList } from '../types'

describe('SavedSetLibrary', () => {
  const savedSets: SetList[] = [
    {
      id: 's1',
      name: 'Morning Set',
      type: 'warmup',
      tracks: [],
      totalDuration: '10:00',
    },
  ]

  it('collapses by default and expands on toggle', async () => {
    const user = userEvent.setup()

    render(
      <SavedSetLibrary
        savedSets={savedSets}
        currentSetId=""
        isSetDirty={false}
        isCurrentSetSaved={false}
        onLoadSet={vi.fn()}
        onRenameSet={vi.fn()}
        onDeleteSet={vi.fn()}
      />
    )

    expect(screen.getByText('已保存 Set 库')).toBeTruthy()
    expect(screen.queryByText('Morning Set')).toBeNull()

    await user.click(screen.getByRole('button', { name: '展开已保存 Set' }))

    expect(screen.getByText('Morning Set')).toBeTruthy()
    expect(screen.getByRole('button', { name: '收起已保存 Set' })).toBeTruthy()
    expect(document.querySelector('.saved-set-scroll')).toBeTruthy()
  })
})
