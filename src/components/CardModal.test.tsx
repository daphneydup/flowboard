import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import CardModal from './CardModal'
import { makeCard } from '../test/factories'

function setup(props: Partial<React.ComponentProps<typeof CardModal>> = {}) {
  const onSave = vi.fn()
  const onClose = vi.fn()
  render(<CardModal card={null} assignees={[]} onSave={onSave} onClose={onClose} {...props} />)
  return { onSave, onClose, user: userEvent.setup() }
}

const titleBox = () => screen.getByRole('textbox', { name: /Title/ })

describe('fields and saving', () => {
  it('saves with just a title: assignee and due date are optional', async () => {
    const { user, onSave } = setup()
    await user.type(titleBox(), '  Ship it  ')
    await user.click(screen.getByRole('button', { name: 'Add card' }))
    expect(onSave).toHaveBeenCalledWith({ title: 'Ship it', assignee: '', priority: 'Medium', dueDate: '' })
  })

  it('saves every field', async () => {
    const { user, onSave } = setup()
    await user.type(titleBox(), 'Full card')
    await user.type(screen.getByRole('combobox', { name: /Assignee/ }), 'bo@example.com')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Priority' }), 'High')
    await user.click(screen.getByRole('button', { name: 'Add card' }))
    expect(onSave).toHaveBeenCalledWith({ title: 'Full card', assignee: 'bo@example.com', priority: 'High', dueDate: '' })
  })

  it('prefills when editing', () => {
    setup({ card: makeCard({ title: 'Existing', assignee: 'ana@example.com', priority: 'Low', dueDate: '2026-11-05' }) })
    expect(screen.getByRole('dialog', { name: 'Edit card' })).toBeInTheDocument()
    expect(titleBox()).toHaveValue('Existing')
    expect(screen.getByRole('combobox', { name: /Assignee/ })).toHaveValue('ana@example.com')
    expect(screen.getByRole('combobox', { name: 'Priority' })).toHaveValue('Low')
    expect(screen.getByRole('button', { name: 'Due date (optional)' })).toHaveTextContent('November 5, 2026')
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })

  it('limits the title to 100 characters', () => {
    setup()
    expect(titleBox()).toHaveAttribute('maxlength', '100')
  })

  it('suggests assignees already on the board', () => {
    setup({ assignees: ['ana@example.com', 'bo@example.com'] })
    const options = [...document.querySelectorAll('#assignee-options option')].map((o) => o.getAttribute('value'))
    expect(options).toEqual(['ana@example.com', 'bo@example.com'])
  })
})

describe('validation and labelling', () => {
  it('marks the title as required for everyone, including screen readers', () => {
    setup()
    expect(titleBox()).toHaveAttribute('aria-required', 'true')
    expect(screen.getByText('(required)')).toBeInTheDocument()
  })

  it('shows a title error that is announced but not part of the field label', async () => {
    const { user, onSave } = setup()
    await user.click(screen.getByRole('button', { name: 'Add card' }))

    const error = screen.getByRole('alert')
    expect(error).toHaveTextContent('Give the card a title.')
    expect(onSave).not.toHaveBeenCalled()
    expect(titleBox()).toHaveAttribute('aria-invalid', 'true')
    expect(titleBox()).toHaveAccessibleDescription('Give the card a title.')
    // the field's name stays "Title (required)", not "Title (required) Give the card a title."
    expect(titleBox()).toHaveAccessibleName('Title (required)')
    expect(titleBox()).toHaveFocus()
  })

  it('treats a whitespace-only title as empty and clears the error when typing', async () => {
    const { user, onSave } = setup()
    await user.type(titleBox(), '   ')
    await user.click(screen.getByRole('button', { name: 'Add card' }))
    expect(onSave).not.toHaveBeenCalled()
    await user.type(titleBox(), 'a')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('keyboard and focus', () => {
  it('closes on Escape', async () => {
    const { user, onClose } = setup()
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes when the backdrop is clicked, but not when the dialog is', async () => {
    const { onClose } = setup()
    fireEvent.mouseDown(screen.getByRole('dialog'))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.mouseDown(screen.getByRole('dialog').parentElement as HTMLElement)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('keeps Tab inside the dialog in both directions', async () => {
    const { user } = setup()
    screen.getByRole('button', { name: 'Add card' }).focus()
    await user.tab()
    expect(titleBox()).toHaveFocus()

    await user.tab({ shift: true })
    expect(screen.getByRole('button', { name: 'Add card' })).toHaveFocus()
  })

  it('focuses the title when it opens', () => {
    setup()
    expect(titleBox()).toHaveFocus()
  })

  it('gives focus back to the button that opened it', async () => {
    function Harness() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button onClick={() => setOpen(true)}>Open</button>
          {open && <CardModal card={null} assignees={[]} onSave={() => {}} onClose={() => setOpen(false)} />}
        </>
      )
    }
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Open' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open' })).toHaveFocus()
  })

  it('lets the calendar handle its own Escape without closing the whole dialog', async () => {
    const { user, onClose } = setup()
    await user.click(screen.getByRole('button', { name: /Due date/ }))
    expect(screen.getByRole('dialog', { name: /Choose due date/ })).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: /Choose due date/ })).not.toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()

    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
