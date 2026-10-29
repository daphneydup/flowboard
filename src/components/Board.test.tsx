import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import Board from './Board'
import { api, seedApi } from '../test/fakeApi'
import { makeCard, USER_ID } from '../test/factories'
import { makeDataTransfer } from '../test/dragData'

vi.mock('../api', async () => (await import('../test/fakeApi')).api)

const column = (name: string) => screen.getByRole('region', { name })
const cardEl = (title: string) => screen.getByText(title, { selector: 'h3' }).closest('article') as HTMLElement

function renderBoard() {
  const onStatus = vi.fn()
  render(<Board userId={USER_ID} onStatus={onStatus} />)
  return onStatus
}

// Toast/undo timers need to be controllable; only fake the timer functions the board uses.
function withFakeTimers() {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  return userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) })
}
const advance = (ms: number) => act(async () => void vi.advanceTimersByTime(ms))

describe('creating a card', () => {
  it('adds the card to the column, saves it, and confirms with a toast', async () => {
    seedApi([])
    const user = userEvent.setup()
    renderBoard()

    await user.click(await within(await screen.findByRole('region', { name: 'In Progress' })).findByRole('button', { name: '+ Add card' }))
    const dialog = screen.getByRole('dialog', { name: 'New card' })
    await user.type(within(dialog).getByRole('textbox', { name: /Title/ }), 'Write tests')
    await user.click(within(dialog).getByRole('button', { name: 'Add card' }))

    expect(within(column('In Progress')).getByText('Write tests')).toBeInTheDocument()
    expect(api.insertCard).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Write tests', column: 'in-progress', createdBy: USER_ID, position: 0 }),
    )
    expect(await screen.findByText('Card added')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('places a new card after the existing ones', async () => {
    seedApi([makeCard({ title: 'First', position: 4 })])
    const user = userEvent.setup()
    renderBoard()

    await screen.findByText('First')
    await user.click(within(column('Backlog')).getByRole('button', { name: '+ Add card' }))
    await user.type(screen.getByRole('textbox', { name: /Title/ }), 'Second')
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add card' }))

    expect(api.insertCard).toHaveBeenCalledWith(expect.objectContaining({ title: 'Second', position: 5 }))
  })

  it('does not save a card without a title', async () => {
    seedApi([])
    const user = userEvent.setup()
    renderBoard()

    await user.click(within(await screen.findByRole('region', { name: 'Backlog' })).getByRole('button', { name: '+ Add card' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add card' }))

    expect(screen.getByText('Give the card a title.')).toBeInTheDocument()
    expect(api.insertCard).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

describe('editing a card', () => {
  it('updates the card and confirms with a toast', async () => {
    seedApi([makeCard({ title: 'Old title' })])
    const user = userEvent.setup()
    renderBoard()

    await user.click(await screen.findByRole('button', { name: 'Edit “Old title”' }))
    const title = screen.getByRole('textbox', { name: /Title/ })
    await user.clear(title)
    await user.type(title, 'New title')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.getByText('New title', { selector: 'h3' })).toBeInTheDocument()
    expect(screen.queryByText('Old title')).not.toBeInTheDocument()
    expect(api.updateCard).toHaveBeenCalledWith(expect.objectContaining({ title: 'New title' }))
    expect(await screen.findByText('Card updated')).toBeInTheDocument()
  })

  it('keeps the card as it was when the save fails, and tells the user', async () => {
    const seeded = seedApi([makeCard({ title: 'Keep me' })])
    const user = userEvent.setup()
    renderBoard()

    await user.click(await screen.findByRole('button', { name: 'Edit “Keep me”' }))
    api.updateCard.mockRejectedValueOnce(new Error('boom'))
    const title = screen.getByRole('textbox', { name: /Title/ })
    await user.clear(title)
    await user.type(title, 'Changed')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong, so your change was reverted.')
    await waitFor(() => expect(screen.getByText('Keep me', { selector: 'h3' })).toBeInTheDocument())
    expect(api.fetchCards).toHaveBeenCalledTimes(2) // reloaded from the server
    expect(seeded.cards()[0].title).toBe('Keep me')
  })
})

describe('moving a card', () => {
  it('moves it with the column menu only after pressing Move', async () => {
    seedApi([makeCard({ title: 'Move me' })])
    const user = userEvent.setup()
    renderBoard()

    const select = await screen.findByRole('combobox', { name: 'Column for “Move me”' })
    await user.selectOptions(select, 'In Progress')
    expect(api.updateCard).not.toHaveBeenCalled() // choosing is not moving
    expect(within(column('Backlog')).getByText('Move me')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Move “Move me” to In Progress' }))

    expect(within(column('In Progress')).getByText('Move me')).toBeInTheDocument()
    expect(api.updateCard).toHaveBeenCalledWith(expect.objectContaining({ title: 'Move me', column: 'in-progress' }))
    expect(await screen.findByText('Moved to In Progress')).toBeInTheDocument()
  })

  it('keeps keyboard focus on the moved card', async () => {
    seedApi([makeCard({ title: 'Focus me' })])
    const user = userEvent.setup()
    renderBoard()

    await user.selectOptions(await screen.findByRole('combobox', { name: 'Column for “Focus me”' }), 'Done')
    await user.click(screen.getByRole('button', { name: 'Move “Focus me” to Done' }))

    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Column for “Focus me”' })).toHaveFocus())
  })

  it('moves a card to another column by dragging it onto a card', async () => {
    seedApi([
      makeCard({ title: 'Dragged', column: 'backlog', position: 0 }),
      makeCard({ title: 'Target', column: 'in-progress', position: 0 }),
    ])
    renderBoard()
    await screen.findByText('Dragged')

    const dataTransfer = makeDataTransfer()
    fireEvent.dragStart(cardEl('Dragged'), { dataTransfer })
    fireEvent.drop(cardEl('Target'), { dataTransfer })

    expect(within(column('In Progress')).getByText('Dragged')).toBeInTheDocument()
    // dropped before "Target" (position 0), so it takes the slot ahead of it
    expect(api.updateCard).toHaveBeenCalledWith(expect.objectContaining({ title: 'Dragged', column: 'in-progress', position: -1 }))
  })

  it('drops between two cards at the midpoint of their positions', async () => {
    seedApi([
      makeCard({ title: 'Dragged', column: 'backlog', position: 0 }),
      makeCard({ title: 'One', column: 'done', position: 0 }),
      makeCard({ title: 'Two', column: 'done', position: 1 }),
    ])
    renderBoard()
    await screen.findByText('Dragged')

    const dataTransfer = makeDataTransfer()
    fireEvent.dragStart(cardEl('Dragged'), { dataTransfer })
    fireEvent.drop(cardEl('Two'), { dataTransfer })

    expect(api.updateCard).toHaveBeenCalledWith(expect.objectContaining({ title: 'Dragged', position: 0.5 }))
  })

  it('drops at the end of a column when dropped on empty space', async () => {
    seedApi([
      makeCard({ title: 'Dragged', column: 'backlog', position: 0 }),
      makeCard({ title: 'Last', column: 'in-review', position: 3 }),
    ])
    renderBoard()
    await screen.findByText('Dragged')

    const dataTransfer = makeDataTransfer()
    fireEvent.dragStart(cardEl('Dragged'), { dataTransfer })
    fireEvent.drop(column('In Review'), { dataTransfer })

    expect(api.updateCard).toHaveBeenCalledWith(expect.objectContaining({ title: 'Dragged', column: 'in-review', position: 4 }))
  })

  it('celebrates when a card reaches Done, then stops', async () => {
    seedApi([makeCard({ title: 'Ship it' })])
    const user = withFakeTimers()
    renderBoard()

    await user.selectOptions(await screen.findByRole('combobox', { name: 'Column for “Ship it”' }), 'Done')
    await user.click(screen.getByRole('button', { name: 'Move “Ship it” to Done' }))

    expect(await screen.findByText('Nice work! Moved to Done')).toBeInTheDocument()
    expect(document.querySelector('.confetti')).toBeInTheDocument()
    expect(cardEl('Ship it')).toHaveClass('card-celebrate')

    await advance(1600)
    expect(document.querySelector('.confetti')).not.toBeInTheDocument()
  })

  it('does not celebrate a card that is already done', async () => {
    seedApi([makeCard({ title: 'Already done', column: 'done' })])
    const user = userEvent.setup()
    renderBoard()

    await user.click(await screen.findByRole('button', { name: 'Edit “Already done”' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(document.querySelector('.confetti')).not.toBeInTheDocument()
  })
})

describe('deleting a card', () => {
  it('removes the card at once but only deletes it on the server when the undo window ends', async () => {
    seedApi([makeCard({ title: 'Bye' })])
    const user = withFakeTimers()
    renderBoard()

    await user.click(await screen.findByRole('button', { name: 'Delete “Bye”' }))

    expect(screen.queryByText('Bye', { selector: 'h3' })).not.toBeInTheDocument()
    expect(screen.getByText('Deleted “Bye”')).toBeInTheDocument()
    expect(api.deleteCard).not.toHaveBeenCalled()

    await advance(10_000)
    expect(api.deleteCard).toHaveBeenCalledTimes(1)
  })

  it('restores the card and never deletes it when Undo is pressed', async () => {
    seedApi([makeCard({ title: 'Keep' })])
    const user = withFakeTimers()
    renderBoard()

    await user.click(await screen.findByRole('button', { name: 'Delete “Keep”' }))
    await user.click(screen.getByRole('button', { name: 'Undo' }))

    expect(screen.getByText('Keep', { selector: 'h3' })).toBeInTheDocument()
    await advance(20_000)
    expect(api.deleteCard).not.toHaveBeenCalled()
  })

  it('undoes with Ctrl+Z so keyboard users do not have to find the toast', async () => {
    seedApi([makeCard({ title: 'Oops' })])
    const user = withFakeTimers()
    renderBoard()

    await user.click(await screen.findByRole('button', { name: 'Delete “Oops”' }))
    expect(screen.queryByText('Oops', { selector: 'h3' })).not.toBeInTheDocument()
    await user.keyboard('{Control>}z{/Control}')

    expect(screen.getByText('Oops', { selector: 'h3' })).toBeInTheDocument()
    await advance(20_000)
    expect(api.deleteCard).not.toHaveBeenCalled()
  })

  it('does not undo when typing in a field', async () => {
    seedApi([makeCard({ title: 'Gone' })])
    const user = withFakeTimers()
    renderBoard()

    await user.click(await screen.findByRole('button', { name: 'Delete “Gone”' }))
    await user.click(screen.getByRole('searchbox', { name: 'Search cards' }))
    await user.keyboard('{Control>}z{/Control}')

    expect(screen.queryByText('Gone', { selector: 'h3' })).not.toBeInTheDocument()
  })

  it('moves focus to the next card after a delete, or to Add card if none is left', async () => {
    seedApi([
      makeCard({ title: 'First', position: 0 }),
      makeCard({ title: 'Second', position: 1 }),
    ])
    const user = withFakeTimers()
    renderBoard()

    await user.click(await screen.findByRole('button', { name: 'Delete “First”' }))
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Column for “Second”' })).toHaveFocus())

    await user.click(screen.getByRole('button', { name: 'Delete “Second”' }))
    await waitFor(() => expect(within(column('Backlog')).getByRole('button', { name: '+ Add card' })).toHaveFocus())
  })

  it('only offers Delete on cards the user created', async () => {
    seedApi([makeCard({ title: 'Mine' }), makeCard({ title: 'Theirs', createdBy: 'someone-else' })])
    renderBoard()
    await screen.findByText('Mine')

    expect(screen.getByRole('button', { name: 'Delete “Mine”' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete “Theirs”' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit “Theirs”' })).toBeInTheDocument() // teammates can still edit
  })

  it('brings the card back with an explanation when the server refuses the delete', async () => {
    seedApi([makeCard({ title: 'Protected' })])
    const user = withFakeTimers()
    renderBoard()
    await screen.findByText('Protected')
    api.deleteCard.mockRejectedValueOnce(new Error('permission: you can only delete cards you created'))

    await user.click(screen.getByRole('button', { name: 'Delete “Protected”' }))
    await advance(10_000)

    expect(await screen.findByText('You can only delete cards you created.')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('Protected', { selector: 'h3' })).toBeInTheDocument())
  })

  it('still deletes a card waiting on Undo if the board closes', async () => {
    seedApi([makeCard({ title: 'Closing' })])
    const user = withFakeTimers()
    const { unmount } = render(<Board userId={USER_ID} onStatus={vi.fn()} />)

    await user.click(await screen.findByRole('button', { name: 'Delete “Closing”' }))
    unmount()

    expect(api.deleteCard).toHaveBeenCalledTimes(1)
  })
})

describe('loading, empty and error states', () => {
  it('shows a loading message and tells assistive tech', async () => {
    seedApi([])
    api.fetchCards.mockReturnValue(new Promise(() => {}))
    const onStatus = renderBoard()

    expect(await screen.findByText('Loading board…')).toBeInTheDocument()
    expect(onStatus).toHaveBeenCalledWith('Loading board…')
  })

  it('shows a welcome hint and empty-column text on a new board', async () => {
    seedApi([])
    const onStatus = renderBoard()

    expect(await screen.findByText(/Add your first card/)).toBeInTheDocument()
    expect(screen.getAllByText(/No cards yet\./)).toHaveLength(4)
    await waitFor(() => expect(onStatus).toHaveBeenCalledWith('Board loaded'))
  })

  it('offers a Retry button when the first load fails, and recovers', async () => {
    seedApi([makeCard({ title: 'After retry' })])
    api.fetchCards.mockRejectedValueOnce(new Error('server down'))
    const user = userEvent.setup()
    renderBoard()

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load the board")
    await user.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByText('After retry', { selector: 'h3' })).toBeInTheDocument()
  })

  it('shows a no-access message to people who are not on the team and fetches nothing', async () => {
    seedApi([makeCard()], { member: false })
    renderBoard()

    expect(await screen.findByText("You don't have access yet")).toBeInTheDocument()
    expect(api.fetchCards).not.toHaveBeenCalled()
  })

  it('shows progress toward Done', async () => {
    seedApi([makeCard({ column: 'done' }), makeCard(), makeCard()])
    renderBoard()

    expect(await screen.findByText('1 of 3 done')).toBeInTheDocument()
  })
})

describe('searching', () => {
  it('filters cards by title or assignee and announces how many match', async () => {
    seedApi([
      makeCard({ title: 'Fix login', assignee: 'ana@example.com' }),
      makeCard({ title: 'Write docs', assignee: 'bo@example.com' }),
      makeCard({ title: 'Plan sprint', assignee: 'ana@example.com' }),
    ])
    const user = withFakeTimers()
    renderBoard()

    await user.type(await screen.findByRole('searchbox', { name: 'Search cards' }), 'ana')

    expect(screen.getByText('Fix login', { selector: 'h3' })).toBeInTheDocument()
    expect(screen.getByText('Plan sprint', { selector: 'h3' })).toBeInTheDocument()
    expect(screen.queryByText('Write docs', { selector: 'h3' })).not.toBeInTheDocument()

    await advance(600)
    expect(screen.getByText('2 of 3 cards match')).toBeInTheDocument()
  })

  it('says so when nothing matches', async () => {
    seedApi([makeCard({ title: 'Something' })])
    const user = userEvent.setup()
    renderBoard()

    await user.type(await screen.findByRole('searchbox', { name: 'Search cards' }), 'zzz')

    expect(screen.getAllByText('No matching cards.')).toHaveLength(4)
  })
})

describe('accessibility of the board view', () => {
  it('puts the toolbar, search and columns inside one main landmark', async () => {
    seedApi([makeCard()])
    renderBoard()
    await screen.findByRole('searchbox', { name: 'Search cards' })
    const main = screen.getByRole('main')

    expect(within(main).getByRole('searchbox', { name: 'Search cards' })).toBeInTheDocument()
    expect(within(main).getAllByRole('region')).toHaveLength(4)
  })

  it('makes the board inert while the card dialog is open', async () => {
    seedApi([makeCard({ title: 'Behind' })])
    const user = userEvent.setup()
    renderBoard()

    await user.click(await screen.findByRole('button', { name: 'Edit “Behind”' }))

    expect(screen.getByRole('main')).toHaveAttribute('inert')
  })
})
