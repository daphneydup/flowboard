import type { CardData } from '../types'

let counter = 0

export const USER_ID = 'user-1'

export function makeCard(overrides: Partial<CardData> = {}): CardData {
  counter += 1
  return {
    id: `card-${counter}`,
    title: `Task ${counter}`,
    assignee: '',
    priority: 'Medium',
    dueDate: '',
    column: 'backlog',
    position: 0,
    createdBy: USER_ID,
    ...overrides,
  }
}
