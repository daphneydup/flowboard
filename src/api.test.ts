import { describe, expect, it } from 'vitest'
import { deleteCard, fetchCards, insertCard, isTeamMember, updateCard } from './api'
import { fromMock, queryBuilder } from './test/mockSupabase'
import { makeCard } from './test/factories'

const row = (over = {}) => ({
  id: 'c1',
  title: 'Task',
  assignee: 'ana@example.com',
  priority: 'High',
  due_date: '2026-11-01',
  column: 'in-progress',
  position: 2,
  created_by: 'u1',
  ...over,
})

describe('fetchCards', () => {
  it('reads the cards table in position order and maps rows to cards', async () => {
    const builder = queryBuilder({ data: [row(), row({ id: 'c2', due_date: null, created_by: 'u2' })] })
    fromMock.mockReturnValue(builder)

    const cards = await fetchCards()

    expect(fromMock).toHaveBeenCalledWith('cards')
    expect(builder.order).toHaveBeenCalledWith('position', { ascending: true })
    expect(builder.select).toHaveBeenCalledWith(expect.stringContaining('created_by'))
    expect(cards[0]).toEqual({
      id: 'c1',
      title: 'Task',
      assignee: 'ana@example.com',
      priority: 'High',
      dueDate: '2026-11-01',
      column: 'in-progress',
      position: 2,
      createdBy: 'u1',
    })
    expect(cards[1].dueDate).toBe('') // a missing date becomes an empty string
    expect(cards[1].createdBy).toBe('u2')
  })

  it('throws the database error so the board can show it', async () => {
    fromMock.mockReturnValue(queryBuilder({ error: new Error('db down') }))
    await expect(fetchCards()).rejects.toThrow('db down')
  })
})

describe('insertCard', () => {
  it('sends the card columns, stores an empty date as null, and never sets the owner itself', async () => {
    const builder = queryBuilder({})
    fromMock.mockReturnValue(builder)

    await insertCard(makeCard({ id: 'new', title: 'Hello', dueDate: '', column: 'done', position: 3 }))

    const payload = builder.insert.mock.calls[0][0]
    expect(payload).toEqual({
      id: 'new',
      title: 'Hello',
      assignee: '',
      priority: 'Medium',
      due_date: null,
      column: 'done',
      position: 3,
    })
    // The database fills created_by from the signed-in user; a client must not be able to choose it.
    expect(payload).not.toHaveProperty('created_by')
  })

  it('keeps a real due date', async () => {
    const builder = queryBuilder({})
    fromMock.mockReturnValue(builder)
    await insertCard(makeCard({ dueDate: '2026-12-24' }))
    expect(builder.insert.mock.calls[0][0].due_date).toBe('2026-12-24')
  })

  it('throws when the insert is rejected', async () => {
    fromMock.mockReturnValue(queryBuilder({ error: new Error('row-level security') }))
    await expect(insertCard(makeCard())).rejects.toThrow('row-level security')
  })
})

describe('updateCard', () => {
  it('updates only that card and never sends the owner', async () => {
    const builder = queryBuilder({})
    fromMock.mockReturnValue(builder)

    await updateCard(makeCard({ id: 'c9', title: 'Renamed', column: 'in-review', position: 1.5 }))

    expect(builder.eq).toHaveBeenCalledWith('id', 'c9')
    const payload = builder.update.mock.calls[0][0]
    expect(payload).toMatchObject({ title: 'Renamed', column: 'in-review', position: 1.5, due_date: null })
    expect(payload).not.toHaveProperty('created_by')
    expect(payload).not.toHaveProperty('id')
  })
})

describe('deleteCard', () => {
  it('deletes by id and asks for the deleted rows back', async () => {
    const builder = queryBuilder({ data: [{ id: 'c1' }] })
    fromMock.mockReturnValue(builder)

    await expect(deleteCard('c1')).resolves.toBeUndefined()
    expect(builder.eq).toHaveBeenCalledWith('id', 'c1')
    expect(builder.select).toHaveBeenCalledWith('id')
  })

  it('treats "no rows deleted" as a failure, because row-level security hides refused deletes', async () => {
    fromMock.mockReturnValue(queryBuilder({ data: [] }))
    await expect(deleteCard('someone-elses')).rejects.toThrow(/only delete cards you created/)
  })

  it('throws database errors', async () => {
    fromMock.mockReturnValue(queryBuilder({ error: new Error('nope') }))
    await expect(deleteCard('c1')).rejects.toThrow('nope')
  })
})

describe('isTeamMember', () => {
  it('is true when the user has a membership row', async () => {
    const builder = queryBuilder({ data: { user_id: 'u1' } })
    fromMock.mockReturnValue(builder)
    await expect(isTeamMember()).resolves.toBe(true)
    expect(fromMock).toHaveBeenCalledWith('team_members')
  })

  it('is false when there is no row', async () => {
    fromMock.mockReturnValue(queryBuilder({ data: null }))
    await expect(isTeamMember()).resolves.toBe(false)
  })

  it('throws on errors instead of guessing', async () => {
    fromMock.mockReturnValue(queryBuilder({ error: new Error('boom') }))
    await expect(isTeamMember()).rejects.toThrow('boom')
  })
})
