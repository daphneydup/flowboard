export type ColumnId = 'backlog' | 'in-progress' | 'in-review' | 'done'
export type Priority = 'High' | 'Medium' | 'Low'

export interface CardData {
  id: string
  title: string
  assignee: string
  priority: Priority
  dueDate: string
  column: ColumnId
  position: number
  createdBy?: string
}

export const COLUMNS: { id: ColumnId; label: string }[] = [
  { id: 'backlog', label: 'Backlog' },
  { id: 'in-progress', label: 'In Progress' },
  { id: 'in-review', label: 'In Review' },
  { id: 'done', label: 'Done' },
]

export const PRIORITIES: Priority[] = ['High', 'Medium', 'Low']
