import { vi } from 'vitest'
import type { CardData } from '../types'

// Mocked replacement for src/api.ts, backed by an in-memory "database".
export const api = {
  fetchCards: vi.fn(),
  insertCard: vi.fn(),
  updateCard: vi.fn(),
  deleteCard: vi.fn(),
  isTeamMember: vi.fn(),
}

export function seedApi(cards: CardData[] = [], options: { member?: boolean } = {}) {
  let store = cards.map((c) => ({ ...c }))
  api.isTeamMember.mockResolvedValue(options.member ?? true)
  api.fetchCards.mockImplementation(async () => store.map((c) => ({ ...c })))
  api.insertCard.mockImplementation(async (c: CardData) => {
    store.push({ ...c })
  })
  api.updateCard.mockImplementation(async (c: CardData) => {
    store = store.map((x) => (x.id === c.id ? { ...c } : x))
  })
  api.deleteCard.mockImplementation(async (id: string) => {
    store = store.filter((x) => x.id !== id)
  })
  return { cards: () => store }
}
