import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'

interface Props {
  label: string
  value: string // ISO yyyy-mm-dd, or '' for none
  onChange: (iso: string) => void
}

const pad = (n: number) => String(n).padStart(2, '0')
const toISO = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}` // m is zero-based
const fromDate = (dt: Date) => toISO(dt.getFullYear(), dt.getMonth(), dt.getDate())
const parse = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return { y, m: m - 1, d }
}
const addDays = (iso: string, n: number) => {
  const { y, m, d } = parse(iso)
  return fromDate(new Date(y, m, d + n))
}
const addMonths = (iso: string, n: number) => {
  const { y, m, d } = parse(iso)
  const lastDay = new Date(y, m + n + 1, 0).getDate()
  return fromDate(new Date(y, m + n, Math.min(d, lastDay)))
}

const WEEKDAYS = [...Array(7)].map((_, i) => {
  const date = new Date(2024, 0, 7 + i) // 7 Jan 2024 is a Sunday
  return {
    short: date.toLocaleDateString(undefined, { weekday: 'narrow' }),
    long: date.toLocaleDateString(undefined, { weekday: 'long' }),
  }
})

const formatLong = (iso: string) => {
  const { y, m, d } = parse(iso)
  return new Date(y, m, d).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

export default function DatePicker({ label, value, onChange }: Props) {
  const [today] = useState(() => fromDate(new Date()))
  const [open, setOpen] = useState(false)
  const [up, setUp] = useState(false)
  const [cursor, setCursor] = useState(value || today)
  const wrapRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const focusDay = useRef(false)
  const labelId = useId()

  // Move keyboard focus onto the active day after the grid re-renders.
  useEffect(() => {
    if (open && focusDay.current) {
      focusDay.current = false
      popRef.current?.querySelector<HTMLElement>(`[data-iso="${cursor}"]`)?.focus()
    }
  }, [open, cursor])

  const openPicker = () => {
    const rect = wrapRef.current?.getBoundingClientRect()
    if (rect) setUp(window.innerHeight - rect.bottom < 360 && rect.top > 360)
    setCursor(value || today)
    focusDay.current = true
    setOpen(true)
  }

  const close = (refocus: boolean) => {
    setOpen(false)
    if (refocus) triggerRef.current?.focus()
  }

  const pick = (iso: string) => {
    onChange(iso)
    close(true)
  }

  const move = (iso: string) => {
    focusDay.current = true
    setCursor(iso)
  }

  const onKeyDown = (e: KeyboardEvent) => {
    const steps: Record<string, () => string> = {
      ArrowLeft: () => addDays(cursor, -1),
      ArrowRight: () => addDays(cursor, 1),
      ArrowUp: () => addDays(cursor, -7),
      ArrowDown: () => addDays(cursor, 7),
      PageUp: () => addMonths(cursor, e.shiftKey ? -12 : -1),
      PageDown: () => addMonths(cursor, e.shiftKey ? 12 : 1),
    }
    if (e.key === 'Escape') {
      e.preventDefault() // lets the surrounding dialog know Escape was already handled
      close(true)
    } else if (steps[e.key] && (e.target as HTMLElement).dataset.iso) {
      e.preventDefault()
      move(steps[e.key]())
    }
  }

  const { y, m } = parse(cursor)
  const firstWeekday = new Date(y, m, 1).getDay()
  const daysInMonth = new Date(y, m + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)
  const weeks = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7))
  const monthTitle = new Date(y, m, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

  return (
    <div
      className="field datepicker"
      ref={wrapRef}
      onBlur={(e) => {
        if (open && !e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false)
      }}
    >
      <span id={labelId}>
        {label} <span className="optional">(optional)</span>
      </span>
      <button
        ref={triggerRef}
        type="button"
        className="date-trigger"
        aria-labelledby={labelId}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open ? close(false) : openPicker())}
      >
        <span aria-hidden="true">📅</span>
        <span className={value ? '' : 'placeholder'}>
          {value ? formatLong(value) : 'Pick a date'}
        </span>
      </button>
      {open && (
        <div
          ref={popRef}
          className={`calendar${up ? ' calendar-up' : ''}`}
          role="dialog"
          aria-label={`Choose ${label.toLowerCase()}`}
          tabIndex={-1}
          onKeyDown={onKeyDown}
        >
          <div className="cal-head">
            <button type="button" className="cal-nav" aria-label="Previous month" onClick={() => setCursor(addMonths(cursor, -1))}>
              ‹
            </button>
            <strong aria-live="polite">{monthTitle}</strong>
            <button type="button" className="cal-nav" aria-label="Next month" onClick={() => setCursor(addMonths(cursor, 1))}>
              ›
            </button>
          </div>
          <div className="cal-grid" role="grid" aria-label={monthTitle}>
            <div className="cal-row" role="row">
              {WEEKDAYS.map((w) => (
                <div key={w.long} className="cal-weekday" role="columnheader">
                  <abbr title={w.long} aria-label={w.long}>{w.short}</abbr>
                </div>
              ))}
            </div>
            {weeks.map((week, wi) => (
              <div key={wi} className="cal-row" role="row">
                {week.map((day, di) => {
                  if (day === null) return <div key={di} role="gridcell" />
                  const iso = toISO(y, m, day)
                  const selected = iso === value
                  const classes = ['cal-day']
                  if (selected) classes.push('cal-selected')
                  if (iso === today) classes.push('cal-today')
                  return (
                    <div key={di} role="gridcell" aria-selected={selected}>
                      <button
                        type="button"
                        className={classes.join(' ')}
                        data-iso={iso}
                        tabIndex={iso === cursor ? 0 : -1}
                        aria-label={formatLong(iso)}
                        aria-current={iso === today ? 'date' : undefined}
                        onClick={() => pick(iso)}
                      >
                        {day}
                      </button>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
          <div className="cal-foot">
            <button type="button" className="link" onClick={() => pick(today)}>Today</button>
            <button type="button" className="link" onClick={() => pick('')} disabled={!value}>Clear</button>
          </div>
        </div>
      )}
    </div>
  )
}
