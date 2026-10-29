import { supabase } from './supabase'
import type { CardData, ColumnId, Priority } from './types'

interface CardRow {
  id: string
  title: string
  assignee: string
  priority: Priority
  due_date: string | null
  column: ColumnId
  position: number
  created_by: string
}

const toCard = (r: CardRow): CardData => ({
  id: r.id,
  title: r.title,
  assignee: r.assignee,
  priority: r.priority,
  dueDate: r.due_date ?? '',
  column: r.column,
  position: r.position,
  createdBy: r.created_by,
})

export async function fetchCards(): Promise<CardData[]> {
  const { data, error } = await supabase
    .from('cards')
    .select('id, title, assignee, priority, due_date, column, position, created_by')
    .order('position', { ascending: true })
  if (error) throw error
  return (data as CardRow[]).map(toCard)
}

export async function insertCard(card: CardData): Promise<void> {
  const { error } = await supabase.from('cards').insert({
    id: card.id,
    title: card.title,
    assignee: card.assignee,
    priority: card.priority,
    due_date: card.dueDate || null,
    column: card.column,
    position: card.position,
  })
  if (error) throw error
}

export async function updateCard(card: CardData): Promise<void> {
  const { error } = await supabase
    .from('cards')
    .update({
      title: card.title,
      assignee: card.assignee,
      priority: card.priority,
      due_date: card.dueDate || null,
      column: card.column,
      position: card.position,
    })
    .eq('id', card.id)
  if (error) throw error
}

export async function deleteCard(id: string): Promise<void> {
  // RLS silently filters rows you may not delete, so confirm a row was actually removed.
  const { data, error } = await supabase.from('cards').delete().eq('id', id).select('id')
  if (error) throw error
  if (!data || data.length === 0) throw new Error('permission: you can only delete cards you created')
}

export async function isTeamMember(): Promise<boolean> {
  const { data, error } = await supabase.from('team_members').select('user_id').maybeSingle()
  if (error) throw error
  return data !== null
}
