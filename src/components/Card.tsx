import { useState } from 'react'
import { COLUMNS } from '../types'
import type { CardData, ColumnId } from '../types'

interface Props {
  card: CardData
  pending: boolean
  today: string
  canDelete: boolean
  celebrating: boolean
  onEdit: (card: CardData) => void
  onDelete: (id: string) => void
  onMoveTo: (column: ColumnId) => void
  onDropBefore: (draggedId: string, targetId: string) => void
}

// Fixed burst pattern: 14 pieces flying outward, slightly upward.
const COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ec4899', '#a855f7']
const CONFETTI = Array.from({ length: 14 }, (_, i) => {
  const angle = (i / 14) * 2 * Math.PI
  const dist = i % 2 ? 90 : 60
  return {
    '--dx': `${Math.round(Math.cos(angle) * dist)}px`,
    '--dy': `${Math.round(Math.sin(angle) * dist - 30)}px`,
    '--rot': `${(i % 2 ? 1 : -1) * (180 + i * 40)}deg`,
    '--c': COLORS[i % COLORS.length],
    '--d': `${(i % 4) * 40}ms`,
  }
})

function formatDate(iso: string): string {
  if (!iso) return 'No due date'
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function Card({ card, pending, today, canDelete, celebrating, onEdit, onDelete, onMoveTo, onDropBefore }: Props) {
  const [dragging, setDragging] = useState(false)
  const [over, setOver] = useState(false)
  // Picking a column only previews the choice; the move happens on the Move button (WCAG 3.2.2).
  const [target, setTarget] = useState<ColumnId>(card.column)

  const open = card.column !== 'done'
  const overdue = open && !!card.dueDate && card.dueDate < today
  const dueToday = open && card.dueDate === today
  const targetLabel = COLUMNS.find((c) => c.id === target)?.label

  const classes = ['card']
  if (dragging) classes.push('card-dragging')
  if (over) classes.push('card-drop-before')
  if (pending) classes.push('card-pending')
  if (celebrating) classes.push('card-celebrate')

  return (
    <article
      className={classes.join(' ')}
      draggable
      data-testid="card"
      data-card-id={card.id}
      aria-busy={pending || undefined}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', card.id)
        e.dataTransfer.effectAllowed = 'move'
        setDragging(true)
      }}
      onDragEnd={() => setDragging(false)}
      onDragOver={(e) => {
        e.preventDefault()
        if (!dragging) setOver(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        e.stopPropagation()
        setOver(false)
        const draggedId = e.dataTransfer.getData('text/plain')
        if (draggedId) onDropBefore(draggedId, card.id)
      }}
    >
      {celebrating && (
        <span className="confetti" aria-hidden="true">
          {CONFETTI.map((p, i) => (
            <i key={i} style={p as React.CSSProperties} />
          ))}
        </span>
      )}
      <div className="card-top">
        <h3>{card.title}</h3>
        <span className={`badge badge-${card.priority.toLowerCase()}`}>{card.priority}</span>
      </div>
      <div className="card-meta">
        <span>{card.assignee || 'Unassigned'}</span>
        <span className={overdue ? 'due-overdue' : dueToday ? 'due-today' : undefined}>
          {overdue && <span aria-hidden="true">⚠ </span>}
          {overdue ? 'Overdue · ' : dueToday ? 'Due today · ' : ''}
          {formatDate(card.dueDate)}
        </span>
      </div>
      {pending && <p className="saving">Saving…</p>}
      <div className="card-actions">
        <select
          className="move-select"
          aria-label={`Column for “${card.title}”`}
          value={target}
          onChange={(e) => setTarget(e.target.value as ColumnId)}
        >
          {COLUMNS.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
        {target !== card.column && (
          <button
            type="button"
            className="primary"
            aria-label={`Move “${card.title}” to ${targetLabel}`}
            onClick={() => onMoveTo(target)}
          >
            Move
          </button>
        )}
        <button type="button" aria-label={`Edit “${card.title}”`} onClick={() => onEdit(card)}>Edit</button>
        {canDelete && (
          <button type="button" className="danger" aria-label={`Delete “${card.title}”`} onClick={() => onDelete(card.id)}>
            Delete
          </button>
        )}
      </div>
    </article>
  )
}
