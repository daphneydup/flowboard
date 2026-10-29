import { useEffect, useRef, useState } from 'react'
import { SWATCHES, applyBackground, cssFor, loadBackground, saveBackground } from '../background'
import type { BgChoice } from '../background'
import { fileToBackground } from '../imageUpload'

export default function BackgroundPicker() {
  const [choice, setChoice] = useState<BgChoice>(loadBackground)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const choosingFile = useRef(false) // the file dialog steals focus; don't treat that as "clicked away"

  useEffect(() => {
    const input = fileRef.current
    const done = () => {
      choosingFile.current = false
    }
    input?.addEventListener('cancel', done)
    return () => input?.removeEventListener('cancel', done)
  }, [])

  // Move focus into the panel when it opens, so keyboard users land on the current choice.
  useEffect(() => {
    if (!open) return
    const current = panelRef.current?.querySelector<HTMLElement>('input[type="radio"]:checked')
    ;(current ?? panelRef.current)?.focus()
  }, [open])

  const update = (next: BgChoice) => {
    setChoice(next)
    applyBackground(next)
    const saved = saveBackground(next)
    setMessage(saved ? null : { text: "Couldn't save this on your device, so it will reset when you reload.", error: true })
  }

  const close = (refocus: boolean) => {
    choosingFile.current = false
    setOpen(false)
    if (refocus) triggerRef.current?.focus()
  }

  const onFile = async (file: File | undefined) => {
    choosingFile.current = false
    if (!file) return
    setBusy(true)
    setMessage(null)
    try {
      update({ kind: 'image', dataUrl: await fileToBackground(file) })
      setMessage((m) => m ?? { text: 'Background updated.', error: false })
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : 'Something went wrong.', error: true })
    } finally {
      setBusy(false)
    }
  }

  const selected = choice.kind === 'swatch' ? choice.id : choice.kind === 'default' ? 'default' : ''
  const customValue = choice.kind === 'custom' ? choice.color : '#3b82f6'

  return (
    <div
      className="bg-picker"
      onKeyDown={(e) => {
        if (open && e.key === 'Escape') {
          e.preventDefault()
          close(true)
        }
      }}
      onBlur={(e) => {
        if (open && !choosingFile.current && !e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false)
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className="icon-btn"
        aria-label="Change board background"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open ? close(false) : setOpen(true))}
      >
        <span aria-hidden="true">🎨</span>
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          void onFile(e.target.files?.[0])
          e.target.value = '' // allow choosing the same file again
        }}
      />
      {open && (
        <div ref={panelRef} className="bg-panel" role="dialog" aria-label="Board background" tabIndex={-1}>
          <fieldset className="swatches">
            <legend>Background</legend>
            <label className="swatch">
              <input type="radio" name="board-bg" className="sr-only" checked={selected === 'default'} onChange={() => update({ kind: 'default' })} />
              <span className="swatch-chip swatch-default" aria-hidden="true">A</span>
              <span className="sr-only">Default</span>
            </label>
            {choice.kind === 'image' && (
              <label className="swatch" title="Your image">
                <input type="radio" name="board-bg" className="sr-only" checked readOnly />
                <span
                  className="swatch-chip"
                  style={{ background: `url("${choice.dataUrl}") center / cover` }}
                  aria-hidden="true"
                />
                <span className="sr-only">Your uploaded image</span>
              </label>
            )}
            {SWATCHES.map((s) => (
              <label key={s.id} className="swatch" title={s.name}>
                <input
                  type="radio"
                  name="board-bg"
                  className="sr-only"
                  checked={selected === s.id}
                  onChange={() => update({ kind: 'swatch', id: s.id })}
                />
                <span className="swatch-chip" style={{ background: cssFor(s.colors) }} aria-hidden="true" />
                <span className="sr-only">{s.name}</span>
              </label>
            ))}
          </fieldset>
          <label className="custom-color">
            Custom color
            <input type="color" value={customValue} onChange={(e) => update({ kind: 'custom', color: e.target.value })} />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              choosingFile.current = true
              fileRef.current?.click()
            }}
          >
            {busy ? 'Processing…' : 'Upload image…'}
          </button>
          <div className="msgs">
            <p className="error" role="alert">{message?.error ? message.text : null}</p>
            <p className="notice" role="status">{message && !message.error ? message.text : null}</p>
          </div>
          <p className="fine-print">JPEG, PNG, WebP or GIF, up to 10 MB. Stored only on this device.</p>
          <button type="button" className="link" onClick={() => update({ kind: 'default' })} disabled={choice.kind === 'default'}>
            Reset to default
          </button>
        </div>
      )}
    </div>
  )
}
