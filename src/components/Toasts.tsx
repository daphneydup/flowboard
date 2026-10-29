import { useEffect, useRef, useState } from 'react'

export interface ToastData {
  id: number
  text: string
  kind: 'success' | 'error'
  undo?: () => void
  onExpire?: () => void // runs when the toast goes away without Undo being used
}

interface Props {
  toasts: ToastData[]
  onDismiss: (id: number) => void
}

const DURATION = { success: 5000, error: 8000, undo: 10000 }

function Toast({ toast, onDismiss }: { toast: ToastData; onDismiss: (id: number) => void }) {
  const [paused, setPaused] = useState(false)
  const expireRef = useRef(toast.onExpire)

  useEffect(() => {
    expireRef.current = toast.onExpire
  })

  // The timer pauses while the pointer or keyboard focus is on the toast (WCAG 2.2.1).
  useEffect(() => {
    if (paused) return
    const ms = toast.undo ? DURATION.undo : DURATION[toast.kind]
    const timer = window.setTimeout(() => {
      expireRef.current?.()
      onDismiss(toast.id)
    }, ms)
    return () => window.clearTimeout(timer)
  }, [paused, toast.id, toast.kind, toast.undo, onDismiss])

  return (
    <div
      className={`toast toast-${toast.kind}`}
      role={toast.kind === 'error' ? 'alert' : 'status'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setPaused(false)
      }}
    >
      <span>{toast.text}</span>
      {toast.undo && (
        <button
          type="button"
          className="toast-undo"
          aria-keyshortcuts="Control+Z Meta+Z"
          onClick={() => {
            toast.undo?.()
            onDismiss(toast.id)
          }}
        >
          Undo <span className="kbd" aria-hidden="true">Ctrl+Z</span>
        </button>
      )}
      <button
        type="button"
        className="toast-x"
        aria-label="Dismiss notification"
        onClick={() => {
          toast.onExpire?.()
          onDismiss(toast.id)
        }}
      >
        ×
      </button>
    </div>
  )
}

export default function Toasts({ toasts, onDismiss }: Props) {
  return (
    <div className="toasts" role="region" aria-label="Notifications">
      {toasts.map((t) => (
        <Toast key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  )
}
