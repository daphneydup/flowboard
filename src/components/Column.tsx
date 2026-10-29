import { useState } from 'react'
import type { CardData, ColumnId } from '../types'
import Card from './Card'

interface Props {
  id: ColumnId
  label: string
  cards: CardData[]
  filtering: boolean
  pendingIds: Set<string>
  today: string
  userId: string
  celebrateId: string | null
  onAdd: (column: ColumnId) => void
  onEdit: (card: CardData) => void
  onDelete: (id: string) => void
  onMove: (cardId: string, column: ColumnId, beforeId?: string) => void
  onMenuMove: (cardId: string, column: ColumnId) => void
}

export default function Column({ id, label, cards, filtering, pendingIds, today, userId, celebrateId, onAdd, onEdit, onDelete, onMove, onMenuMove }: Props) {
  const [over, setOver] = useState(false)

  return (
    <section
      className={`column${over ? ' column-over' : ''}`}
      aria-label={label}
      data-column={id}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        const cardId = e.dataTransfer.getData('text/plain')
        if (cardId) onMove(cardId, id)
      }}
    >
      <header className="column-header">
        <h2>{label}</h2>
        <span className="count">{cards.length}</span>
      </header>
      <div className="column-cards">
        {cards.length === 0 && <p className="empty">{filtering ? 'No matching cards.' : 'No cards yet. Add one below or drop a card here.'}</p>}
        {cards.map((card) => (
          <Card
            key={card.id}
            card={card}
            pending={pendingIds.has(card.id)}
            today={today}
            celebrating={celebrateId === card.id}
            canDelete={card.createdBy === userId}
            onEdit={onEdit}
            onDelete={onDelete}
            onMoveTo={(column) => onMenuMove(card.id, column)}
            onDropBefore={(draggedId, targetId) => {
              setOver(false)
              onMove(draggedId, id, targetId)
            }}
          />
        ))}
      </div>
      <button type="button" className="add-btn" onClick={() => onAdd(id)}>
        + Add card
      </button>
    </section>
  )
}
