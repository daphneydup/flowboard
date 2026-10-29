import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { COLUMNS } from '../types'
import type { CardData, ColumnId } from '../types'
import { deleteCard, fetchCards, insertCard, isTeamMember, updateCard } from '../api'
import Column from './Column'
import CardModal from './CardModal'
import type { CardDraft } from './CardModal'
import Toasts from './Toasts'
import type { ToastData } from './Toasts'

type ModalState = { card: CardData | null; column: ColumnId } | null

const byPosition = (a: CardData, b: CardData) => a.position - b.position

const localISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// Turn raw backend errors into something a person can act on.
function friendly(e: unknown): string {
  const msg = (e as { message?: string })?.message ?? ''
  if (/failed to fetch|network|load failed/i.test(msg)) return "Can't reach the server. Check your connection."
  if (/only delete cards you created/i.test(msg)) return 'You can only delete cards you created.'
  if (/row-level security|permission|jwt/i.test(msg)) return "You don't have permission to do that. Try signing in again."
  return 'Something went wrong, so your change was reverted.'
}

export default function Board({ userId, onStatus }: { userId: string; onStatus: (text: string) => void }) {
  const [cards, setCards] = useState<CardData[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [member, setMember] = useState(true)
  const [modal, setModal] = useState<ModalState>(null)
  const [toasts, setToasts] = useState<ToastData[]>([])
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [today] = useState(() => localISO(new Date()))
  const [resultsMsg, setResultsMsg] = useState('')
  const [celebrateId, setCelebrateId] = useState<string | null>(null)
  const toastId = useRef(0)
  const toastsRef = useRef<ToastData[]>([])
  const focusAfter = useRef<string | null>(null) // selector to focus once the next render settles
  const deletes = useRef(new Map<string, () => void>()) // deletes waiting out their undo window

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])
  const notify = (
    text: string,
    kind: ToastData['kind'] = 'success',
    extra?: Pick<ToastData, 'undo' | 'onExpire'>,
  ) => {
    const id = ++toastId.current
    setToasts((t) => [...t, { id, text, kind, ...extra }])
  }

  const reload = () =>
    fetchCards()
      .then(setCards)
      .catch((e) => notify(friendly(e), 'error'))

  const fetchInitial = () =>
    isTeamMember()
      .then((ok) => {
        setMember(ok)
        return ok ? fetchCards().then(setCards) : undefined
      })
      .catch((e: Error) => setLoadError(e.message))
      .finally(() => setLoading(false))

  const retry = () => {
    setLoading(true)
    setLoadError(null)
    void fetchInitial()
  }

  useEffect(() => {
    void fetchInitial()
  }, [])

  // Make sure deletes waiting on their undo window still happen if the board unmounts.
  useEffect(() => {
    const pending = deletes.current
    return () => [...pending.values()].forEach((commit) => commit())
  }, [])

  // Keep keyboard focus somewhere sensible after a card moves or disappears (WCAG 2.4.3).
  useEffect(() => {
    if (!focusAfter.current) return
    document.querySelector<HTMLElement>(focusAfter.current)?.focus()
    focusAfter.current = null
  }, [cards])

  useEffect(() => {
    toastsRef.current = toasts
  })

  // Ctrl/Cmd+Z undoes the most recent delete, so keyboard users don't have to find the toast.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'z' || !(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return
      if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable]')) return
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return
      const last = [...toastsRef.current].reverse().find((t) => t.undo)
      if (!last) return
      e.preventDefault()
      last.undo?.()
      dismiss(last.id)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [dismiss])

  // Optimistic update: apply locally, persist, flag the card as saving, and re-sync on failure.
  const persist = (id: string, op: Promise<void>, okText?: string) => {
    setPendingIds((p) => new Set(p).add(id))
    return op
      .then(() => okText && notify(okText))
      .catch((e) => {
        notify(friendly(e), 'error')
        return reload()
      })
      .finally(() =>
        setPendingIds((p) => {
          const next = new Set(p)
          next.delete(id)
          return next
        }),
      )
  }

  const save = (draft: CardDraft) => {
    if (!modal) return
    const { card, column } = modal
    if (card) {
      const updated = { ...card, ...draft }
      setCards((prev) => prev.map((c) => (c.id === card.id ? updated : c)))
      void persist(card.id, updateCard(updated), 'Card updated')
    } else {
      const last = cards.filter((c) => c.column === column).sort(byPosition).at(-1)
      const created: CardData = {
        ...draft,
        id: crypto.randomUUID(),
        createdBy: userId,
        column,
        position: last ? last.position + 1 : 0,
      }
      setCards((prev) => [...prev, created])
      void persist(created.id, insertCard(created), 'Card added')
    }
    setModal(null)
  }

  const remove = (id: string) => {
    const card = cards.find((c) => c.id === id)
    if (!card) return
    const siblings = cards.filter((c) => c.column === card.column).sort(byPosition)
    const at = siblings.findIndex((c) => c.id === id)
    const neighbour = siblings[at + 1] ?? siblings[at - 1]
    focusAfter.current = neighbour
      ? `[data-card-id="${neighbour.id}"] .move-select`
      : `[data-column="${card.column}"] .add-btn`
    setCards((prev) => prev.filter((c) => c.id !== id))
    // The delete is only sent once the toast goes away, so Undo can simply put the card back.
    const commit = () => {
      if (!deletes.current.delete(id)) return
      void persist(id, deleteCard(id))
    }
    deletes.current.set(id, commit)
    notify(`Deleted “${card.title}”`, 'success', {
      onExpire: commit,
      undo: () => {
        deletes.current.delete(id)
        focusAfter.current = `[data-card-id="${id}"] .move-select`
        setCards((prev) => [...prev, card])
      },
    })
  }

  const menuMove = (cardId: string, column: ColumnId) => {
    focusAfter.current = `[data-card-id="${cardId}"] .move-select`
    move(cardId, column)
  }

  const move = (cardId: string, column: ColumnId, beforeId?: string) => {
    const dragged = cards.find((c) => c.id === cardId)
    if (!dragged || cardId === beforeId) return
    const target = cards.filter((c) => c.column === column && c.id !== cardId).sort(byPosition)
    const idx = beforeId ? target.findIndex((c) => c.id === beforeId) : -1
    const prev = idx === -1 ? target.at(-1) : target[idx - 1]
    const next = idx === -1 ? undefined : target[idx]
    const position =
      prev && next ? (prev.position + next.position) / 2
      : prev ? prev.position + 1
      : next ? next.position - 1
      : 0
    const moved = { ...dragged, column, position }
    setCards((p) => p.map((c) => (c.id === cardId ? moved : c)))
    const label = COLUMNS.find((c) => c.id === column)?.label
    const finished = column === 'done' && dragged.column !== 'done'
    if (finished) {
      setCelebrateId(cardId)
      window.setTimeout(() => setCelebrateId((id) => (id === cardId ? null : id)), 1500)
    }
    void persist(
      cardId,
      updateCard(moved),
      finished ? 'Nice work! Moved to Done' : column !== dragged.column ? `Moved to ${label}` : undefined,
    )
  }

  const assignees = useMemo(
    () => [...new Set(cards.map((c) => c.assignee).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [cards],
  )
  const q = query.trim().toLowerCase()
  const visible = q
    ? cards.filter((c) => c.title.toLowerCase().includes(q) || c.assignee.toLowerCase().includes(q))
    : cards
  const doneCount = cards.filter((c) => c.column === 'done').length
  const donePct = cards.length ? Math.round((doneCount / cards.length) * 100) : 0
  const matchCount = visible.length

  useEffect(() => {
    onStatus(
      loading ? 'Loading board…' : loadError ? "Couldn't load the board" : !member ? 'You do not have access to this board' : 'Board loaded',
    )
  }, [loading, loadError, member, onStatus])

  // Announce search results after typing pauses, so screen readers aren't flooded.
  useEffect(() => {
    const t = window.setTimeout(() => setResultsMsg(q ? `${matchCount} of ${cards.length} cards match` : ''), 500)
    return () => window.clearTimeout(t)
  }, [q, matchCount, cards.length])

  if (loading)
    return (
      <main id="main" tabIndex={-1}>
        <p className="status"><span className="spinner" aria-hidden="true" />Loading board…</p>
      </main>
    )

  if (!member)
    return (
      <main id="main" tabIndex={-1}>
        <div className="panel" role="alert">
          <h2>You don't have access yet</h2>
          <p>This board is private. Ask the board owner to add your account to the team, then reload.</p>
        </div>
      </main>
    )

  if (loadError)
    return (
      <main id="main" tabIndex={-1}>
        <div className="panel" role="alert">
          <h2>Couldn't load the board</h2>
          <p>{loadError}</p>
          <button type="button" className="primary" onClick={retry}>Retry</button>
        </div>
      </main>
    )

  return (
    <>
      <Toasts toasts={toasts} onDismiss={dismiss} />
      <main id="main" tabIndex={-1} inert={modal ? true : undefined}>
        <div className="toolbar">
          <div className="progress">
            <div className="progress-text">
              {cards.length === 0 ? 'No cards yet' : `${doneCount} of ${cards.length} done`}
            </div>
            <div className="progress-track" aria-hidden="true">
              <div className="progress-fill" style={{ width: `${donePct}%` }} />
            </div>
          </div>
          <label className="search">
            <span className="sr-only">Search cards</span>
            <input
              type="search"
              placeholder="Search cards or people…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <p className="sr-only" role="status">{resultsMsg}</p>
        </div>
        {cards.length === 0 && (
          <p className="hint">
            Welcome! Add your first card with “+ Add card”. Move cards between columns by dragging them or using the “Move to” menu.
          </p>
        )}
        <div className="board">
          {COLUMNS.map((col) => (
            <Column
              key={col.id}
              id={col.id}
              label={col.label}
              cards={visible.filter((c) => c.column === col.id).sort(byPosition)}
              filtering={q !== ''}
              pendingIds={pendingIds}
              today={today}
              userId={userId}
              celebrateId={celebrateId}
              onAdd={(column) => setModal({ card: null, column })}
              onEdit={(card) => setModal({ card, column: card.column })}
              onDelete={remove}
              onMove={move}
              onMenuMove={menuMove}
            />
          ))}
        </div>
      </main>
      {modal && (
        <CardModal
          card={modal.card}
          assignees={assignees}
          onSave={save}
          onClose={() => setModal(null)}
        />
      )}
    </>
  )
}
