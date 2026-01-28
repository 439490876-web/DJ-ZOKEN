/* @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ResetConfirmDialog } from '../components/ResetConfirmDialog'

describe('ResetConfirmDialog', () => {
  it('does not render when closed', () => {
    render(
      <ResetConfirmDialog
        open={false}
        onCancel={() => {}}
        onConfirm={() => {}}
      />
    )

    expect(screen.queryByText('确认重置当前 SET')).toBeNull()
  })

  it('asks for confirmation and triggers callbacks', async () => {
    const onCancel = vi.fn()
    const onConfirm = vi.fn()
    const user = userEvent.setup()

    render(
      <ResetConfirmDialog
        open
        onCancel={onCancel}
        onConfirm={onConfirm}
      />
    )

    expect(screen.getByText('确认重置当前 SET')).toBeTruthy()
    expect(screen.getByText('重置将清空当前编排的所有曲目，此操作不可撤销。')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: '取消' }))
    expect(onCancel).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: '确认重置' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })
})
