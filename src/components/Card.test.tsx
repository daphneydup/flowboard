import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import Card from './Card'
import { makeCard } from '../test/factories'
import type { CardData } from '../types'

function setup(card: Partial<CardData> = {}, props: { pending?: boolean; canDelete?: boolean; celebrating?: boolean; today?: string } = {}) {
  const handlers = { onEdit: vi.fn(), onDelete: vi.fn(), onMoveTo: vi.fn(), onDropBefore: vi.fn() }
  const data = makeCard({ title: 'Plan trip', ...card })
  render(<Card card={data} pending={false} today="2026-10-29" canDelete celebrating={false} {...props} {...handlers} />)
  return { data, ...handlers, user: userEvent.setup() }
}

describe('Card details', () => {
  it('shows the title, priority and fallbacks for a missing assignee and date', () => {
    setup({ priority: 'High' })
    expect(screen.getByRole('heading', { name: 'Plan trip', level: 3 })).toBeInTheDocument()
    expect(screen.getByText('High')).toHaveClass('badge-high')
    expect(screen.getByText('Unassigned')).toBeInTheDocument()
    expect(screen.getByText('No due date')).toBeInTheDocument()
  })

  it('shows the assignee and a formatted date', () => {
    setup({ assignee: 'ana@example.com', dueDate: '2026-12-24' })
    expect(screen.getByText('ana@example.com')).toBeInTheDocument()
    expect(screen.getByText(/Dec/)).toHaveTextContent(/24/)
  })
})

describe('due date warnings (not by colour alone)', () => {
  it('labels an overdue card in words', () => {
    setup({ dueDate: '2026-10-01' })
    const due = screen.getByText(/Overdue/)
    expect(due).toHaveClass('due-overdue')
    expect(due.querySelector('[aria-hidden="true"]')).toBeInTheDocument() // the ⚠ icon is decorative
  })

  it('labels a card due today', () => {
    setup({ dueDate: '2026-10-29' })
    expect(screen.getByText(/Due today/)).toHaveClass('due-today')
  })

  it('shows no warning for a future date', () => {
    setup({ dueDate: '2026-11-30' })
    expect(screen.queryByText(/Overdue|Due today/)).not.toBeInTheDocument()
  })

  it('never calls a finished card overdue', () => {
    setup({ dueDate: '2020-01-01', column: 'done' })
    expect(screen.queryByText(/Overdue/)).not.toBeInTheDocument()
  })
})

describe('moving with the column menu', () => {
  it('shows no Move button until a different column is chosen', async () => {
    const { user, onMoveTo } = setup()
    expect(screen.queryByRole('button', { name: /^Move/ })).not.toBeInTheDocument()

    await user.selectOptions(screen.getByRole('combobox', { name: 'Column for “Plan trip”' }), 'Done')
    expect(onMoveTo).not.toHaveBeenCalled() // changing the menu must not move the card (WCAG 3.2.2)
    expect(screen.getByRole('button', { name: 'Move “Plan trip” to Done' })).toBeInTheDocument()

    await user.selectOptions(screen.getByRole('combobox'), 'Backlog')
    expect(screen.queryByRole('button', { name: /^Move/ })).not.toBeInTheDocument()
  })

  it('moves to the chosen column when Move is pressed', async () => {
    const { user, onMoveTo } = setup()
    await user.selectOptions(screen.getByRole('combobox'), 'In Review')
    await user.click(screen.getByRole('button', { name: 'Move “Plan trip” to In Review' }))
    expect(onMoveTo).toHaveBeenCalledWith('in-review')
  })
})

describe('buttons', () => {
  it('names Edit and Delete after the card so screen readers can tell them apart', async () => {
    const { user, data, onEdit, onDelete } = setup()
    await user.click(screen.getByRole('button', { name: 'Edit “Plan trip”' }))
    await user.click(screen.getByRole('button', { name: 'Delete “Plan trip”' }))
    expect(onEdit).toHaveBeenCalledWith(data)
    expect(onDelete).toHaveBeenCalledWith(data.id)
  })

  it('hides Delete on cards the user did not create', () => {
    setup({}, { canDelete: false })
    expect(screen.queryByRole('button', { name: /Delete/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Edit/ })).toBeInTheDocument()
  })
})

describe('states', () => {
  it('shows Saving… and marks the card busy while a change is in flight', () => {
    setup({}, { pending: true })
    expect(screen.getByText('Saving…')).toBeInTheDocument()
    expect(screen.getByRole('article')).toHaveAttribute('aria-busy', 'true')
  })

  it('shows confetti only while celebrating, and hides it from assistive tech', () => {
    setup({}, { celebrating: true })
    expect(document.querySelector('.confetti')).toHaveAttribute('aria-hidden', 'true')
    expect(document.querySelectorAll('.confetti i')).toHaveLength(14)
  })

  it('can be dragged', () => {
    setup()
    expect(screen.getByRole('article')).toHaveAttribute('draggable', 'true')
  })
})
