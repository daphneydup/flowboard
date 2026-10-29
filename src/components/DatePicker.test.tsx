import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import DatePicker from './DatePicker'

function setup(value = '2026-10-15') {
  const onChange = vi.fn()
  render(<DatePicker label="Due date" value={value} onChange={onChange} />)
  return { onChange, user: userEvent.setup() }
}

const trigger = () => screen.getByRole('button', { name: 'Due date (optional)' })
const focusedIso = () => (document.activeElement as HTMLElement).dataset.iso
const localISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

async function open() {
  const ctx = setup()
  await ctx.user.click(trigger())
  await waitFor(() => expect(focusedIso()).toBe('2026-10-15'))
  return ctx
}

describe('the trigger', () => {
  it('prompts for a date when empty and shows the chosen date otherwise', () => {
    setup('')
    expect(trigger()).toHaveTextContent('Pick a date')
  })

  it('shows the selected date in words', () => {
    setup('2026-10-15')
    expect(trigger()).toHaveTextContent('October 15, 2026')
    expect(trigger()).toHaveAttribute('aria-haspopup', 'dialog')
    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
  })

  it('opens a calendar on click', async () => {
    const { user } = setup()
    await user.click(trigger())
    expect(trigger()).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('dialog', { name: 'Choose due date' })).toBeInTheDocument()
  })
})

describe('calendar structure (valid grid ARIA)', () => {
  it('uses rows, column headers and grid cells', async () => {
    await open()
    const grid = screen.getByRole('grid', { name: /October 2026/ })
    expect(within(grid).getAllByRole('row')).toHaveLength(6) // header + 5 weeks
    expect(within(grid).getAllByRole('columnheader')).toHaveLength(7)
    expect(within(grid).getByRole('columnheader', { name: 'Sunday' })).toBeInTheDocument()
    expect(within(grid).getAllByRole('gridcell')).toHaveLength(35)
  })

  it('marks only the chosen day as selected, and labels days with full dates', async () => {
    await open()
    const day = screen.getByRole('button', { name: /October 15, 2026/ })
    expect(day.closest('[role="gridcell"]')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('button', { name: /October 16, 2026/ }).closest('[role="gridcell"]')).toHaveAttribute('aria-selected', 'false')
  })

  it('only the active day is in the tab order', async () => {
    await open()
    const tabbable = within(screen.getByRole('grid')).getAllByRole('button').filter((b) => b.tabIndex === 0)
    expect(tabbable).toHaveLength(1)
    expect(tabbable[0]).toHaveAttribute('data-iso', '2026-10-15')
  })
})

describe('picking dates', () => {
  it('picks a day, closes, and returns focus to the trigger', async () => {
    const { user, onChange } = await open()
    await user.click(screen.getByRole('button', { name: /October 20, 2026/ }))
    expect(onChange).toHaveBeenCalledWith('2026-10-20')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger()).toHaveFocus()
  })

  it('changes month with the arrows', async () => {
    const { user } = await open()
    await user.click(screen.getByRole('button', { name: 'Next month' }))
    expect(screen.getByRole('grid', { name: /November 2026/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Previous month' }))
    await user.click(screen.getByRole('button', { name: 'Previous month' }))
    expect(screen.getByRole('grid', { name: /September 2026/ })).toBeInTheDocument()
  })

  it('picks today with the Today button', async () => {
    const { user, onChange } = await open()
    await user.click(screen.getByRole('button', { name: 'Today' }))
    expect(onChange).toHaveBeenCalledWith(localISO(new Date()))
  })

  it('clears the date with Clear, which is disabled when there is no date', async () => {
    const { user, onChange } = await open()
    await user.click(screen.getByRole('button', { name: 'Clear' }))
    expect(onChange).toHaveBeenCalledWith('')
  })

  it('disables Clear when empty', async () => {
    const { user } = setup('')
    await user.click(trigger())
    expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled()
  })
})

describe('keyboard', () => {
  it('moves by day and week with the arrow keys', async () => {
    const { user } = await open()
    await user.keyboard('{ArrowRight}')
    expect(focusedIso()).toBe('2026-10-16')
    await user.keyboard('{ArrowDown}')
    expect(focusedIso()).toBe('2026-10-23')
    await user.keyboard('{ArrowLeft}{ArrowUp}')
    expect(focusedIso()).toBe('2026-10-15')
  })

  it('moves by month and year with Page Up/Down', async () => {
    const { user } = await open()
    await user.keyboard('{PageDown}')
    expect(focusedIso()).toBe('2026-11-15')
    await user.keyboard('{Shift>}{PageUp}{/Shift}')
    expect(focusedIso()).toBe('2025-11-15')
  })

  it('keeps the day when moving into a shorter month', async () => {
    const { user, onChange } = setup('2026-01-31')
    await user.click(trigger())
    await waitFor(() => expect(focusedIso()).toBe('2026-01-31'))
    await user.keyboard('{PageDown}')
    expect(focusedIso()).toBe('2026-02-28')
    await user.keyboard('{Enter}')
    expect(onChange).toHaveBeenCalledWith('2026-02-28')
  })

  it('closes on Escape, returns focus, and marks the key as handled so a surrounding dialog stays open', async () => {
    await open()
    const handled = !fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Escape' })
    expect(handled).toBe(true) // defaultPrevented: CardModal checks this before closing itself
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger()).toHaveFocus()
  })

  it('closes when focus moves outside', async () => {
    const { user } = await open()
    await user.click(document.body)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
