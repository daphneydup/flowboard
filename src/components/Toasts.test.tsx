import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import Toasts from './Toasts'
import type { ToastData } from './Toasts'

function setup(toast: Partial<ToastData> = {}) {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  const onDismiss = vi.fn()
  const onExpire = vi.fn()
  const undo = vi.fn()
  const data: ToastData = { id: 1, text: 'Saved', kind: 'success', onExpire, ...toast }
  render(<Toasts toasts={[data]} onDismiss={onDismiss} />)
  return { onDismiss, onExpire, undo, data, user: userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) }) }
}
const advance = (ms: number) => act(async () => void vi.advanceTimersByTime(ms))

describe('Toasts', () => {
  it('is a labelled region', () => {
    setup()
    expect(screen.getByRole('region', { name: 'Notifications' })).toBeInTheDocument()
  })

  it('announces successes politely and errors assertively', () => {
    vi.useFakeTimers()
    render(
      <Toasts
        toasts={[
          { id: 1, text: 'All good', kind: 'success' },
          { id: 2, text: 'It broke', kind: 'error' },
        ]}
        onDismiss={() => {}}
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent('All good')
    expect(screen.getByRole('alert')).toHaveTextContent('It broke')
  })

  it('goes away after a few seconds and reports that it expired', async () => {
    const { onDismiss, onExpire } = setup()
    await advance(4900)
    expect(onDismiss).not.toHaveBeenCalled()
    await advance(200)
    expect(onExpire).toHaveBeenCalledTimes(1)
    expect(onDismiss).toHaveBeenCalledWith(1)
  })

  it('stays longer for errors and longest when there is an Undo', async () => {
    const error = setup({ kind: 'error' })
    await advance(7900)
    expect(error.onDismiss).not.toHaveBeenCalled()
    await advance(200)
    expect(error.onDismiss).toHaveBeenCalled()
  })

  it('gives Undo ten seconds', async () => {
    const { onDismiss, undo } = setup({ undo: vi.fn() })
    void undo
    await advance(9900)
    expect(onDismiss).not.toHaveBeenCalled()
    await advance(200)
    expect(onDismiss).toHaveBeenCalled()
  })

  it('pauses while the pointer is over it and restarts when it leaves (WCAG 2.2.1)', async () => {
    const { user, onDismiss } = setup()
    await user.hover(screen.getByRole('status'))
    await advance(60_000)
    expect(onDismiss).not.toHaveBeenCalled()

    await user.unhover(screen.getByRole('status'))
    await advance(5100)
    expect(onDismiss).toHaveBeenCalled()
  })

  it('pauses while keyboard focus is inside it', async () => {
    const { user, onDismiss } = setup({ undo: vi.fn() })
    await user.tab() // focuses Undo
    expect(screen.getByRole('button', { name: 'Undo' })).toHaveFocus()
    await advance(60_000)
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('runs Undo without treating it as an expiry', async () => {
    const undo = vi.fn()
    const { user, onDismiss, onExpire } = setup({ undo })
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(undo).toHaveBeenCalledTimes(1)
    expect(onDismiss).toHaveBeenCalledWith(1)
    expect(onExpire).not.toHaveBeenCalled()
  })

  it('can be dismissed by hand, which still counts as expiry (so a pending delete goes through)', async () => {
    const { user, onDismiss, onExpire } = setup()
    await user.click(screen.getByRole('button', { name: 'Dismiss notification' }))
    expect(onExpire).toHaveBeenCalledTimes(1)
    expect(onDismiss).toHaveBeenCalledWith(1)
  })

  it('advertises the Ctrl+Z shortcut on Undo', () => {
    setup({ undo: vi.fn() })
    expect(screen.getByRole('button', { name: 'Undo' })).toHaveAttribute('aria-keyshortcuts', 'Control+Z Meta+Z')
  })
})
