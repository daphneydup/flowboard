import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { PRIORITIES } from '../types'
import type { CardData, Priority } from '../types'
import DatePicker from './DatePicker'

export type CardDraft = Omit<CardData, 'id' | 'column' | 'position'>

interface Props {
  card: CardData | null
  assignees: string[]
  onSave: (draft: CardDraft) => void
  onClose: () => void
}

const FOCUSABLE = 'input, select, textarea, button, [href], [tabindex]:not([tabindex="-1"])'

export default function CardModal({ card, assignees, onSave, onClose }: Props) {
  const [title, setTitle] = useState(card?.title ?? '')
  const [assignee, setAssignee] = useState(card?.assignee ?? '')
  const [priority, setPriority] = useState<Priority>(card?.priority ?? 'Medium')
  const [dueDate, setDueDate] = useState(card?.dueDate ?? '')
  const [titleError, setTitleError] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const closeRef = useRef(onClose)
  // Read during the first render: autoFocus moves focus to the title before effects run.
  const [opener] = useState(() => document.activeElement as HTMLElement | null)
  const titleId = useId()
  const errorId = useId()

  useEffect(() => {
    closeRef.current = onClose
  })

  // Trap focus inside the dialog, close on Escape, and hand focus back to the opener.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (!e.defaultPrevented) closeRef.current() // the date picker handles its own Escape
        return
      }
      if (e.key !== 'Tab' || !formRef.current) return
      const items = [...formRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => !(el as HTMLInputElement).disabled,
      )
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      opener?.focus?.()
    }
  }, [opener])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) {
      setTitleError('Give the card a title.')
      titleRef.current?.focus()
      return
    }
    onSave({ title: title.trim(), assignee: assignee.trim(), priority, dueDate })
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        ref={formRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={card ? 'Edit card' : 'New card'}
        onSubmit={submit}
        noValidate
      >
        <h2>{card ? 'Edit card' : 'New card'}</h2>
        <div className="field">
          <label htmlFor={titleId}>Title <span className="optional">(required)</span></label>
          <input
            id={titleId}
            ref={titleRef}
            value={title}
            maxLength={100}
            onChange={(e) => {
              setTitle(e.target.value)
              if (titleError) setTitleError(null)
            }}
            aria-required="true"
            aria-invalid={titleError ? true : undefined}
            aria-describedby={titleError ? errorId : undefined}
            autoFocus
          />
          {titleError && (
            <span id={errorId} className="field-error" role="alert">{titleError}</span>
          )}
        </div>
        <label>
          Assignee <span className="optional">(optional)</span>
          <input value={assignee} onChange={(e) => setAssignee(e.target.value)} list="assignee-options" maxLength={60} />
          <datalist id="assignee-options">
            {assignees.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </label>
        <label>
          Priority
          <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </label>
        <DatePicker label="Due date" value={dueDate} onChange={setDueDate} />
        <div className="modal-actions">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary">{card ? 'Save' : 'Add card'}</button>
        </div>
      </form>
    </div>
  )
}
