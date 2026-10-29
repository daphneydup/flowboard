import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../supabase'

type Mode = 'signin' | 'signup' | 'reset'

const TITLES: Record<Mode, string> = {
  signin: 'Sign in',
  signup: 'Create account',
  reset: 'Reset password',
}
const SUBMIT: Record<Mode, [string, string]> = {
  signin: ['Sign in', 'Signing in…'],
  signup: ['Sign up', 'Creating account…'],
  reset: ['Send reset link', 'Sending…'],
}

export default function Auth() {
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [awaitingConfirm, setAwaitingConfirm] = useState(false)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const refocus = useRef(false)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)

  // Switching modes swaps out the button that was just pressed, so move focus to the new heading.
  useEffect(() => {
    if (refocus.current) {
      refocus.current = false
      headingRef.current?.focus()
    }
  }, [mode])

  const switchMode = (next: Mode) => {
    refocus.current = true
    setMode(next)
    setMessage(null)
    setAwaitingConfirm(false)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setMessage(null)
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) setMessage({ text: error.message, error: true })
      } else if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) setMessage({ text: error.message, error: true })
        else if (!data.session) {
          setAwaitingConfirm(true)
          setMessage({ text: 'Check your email to confirm your account, then sign in.', error: false })
        }
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin,
        })
        if (error) setMessage({ text: error.message, error: true })
        else setMessage({ text: 'If that email has an account, a reset link is on its way.', error: false })
      }
    } catch {
      setMessage({ text: 'Network error. Check your connection and try again.', error: true })
    } finally {
      setBusy(false)
    }
  }

  const resend = async () => {
    setBusy(true)
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email })
      setMessage(
        error
          ? { text: error.message, error: true }
          : { text: 'Confirmation email sent again.', error: false },
      )
    } catch {
      setMessage({ text: 'Network error. Check your connection and try again.', error: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="modal auth" onSubmit={submit}>
      <h2 ref={headingRef} tabIndex={-1}>{TITLES[mode]}</h2>
      <label>
        Email
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
          autoComplete="email"
        />
      </label>
      {mode !== 'reset' && (
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          />
        </label>
      )}
      <div className="msgs">
        <p className="error" role="alert">{message?.error ? message.text : null}</p>
        <p className="notice" role="status">{message && !message.error ? message.text : null}</p>
      </div>
      {awaitingConfirm && (
        <button type="button" className="link" onClick={resend} disabled={busy}>
          Resend confirmation email
        </button>
      )}
      <div className="modal-actions">
        <button type="submit" className="primary" disabled={busy}>
          {busy ? SUBMIT[mode][1] : SUBMIT[mode][0]}
        </button>
      </div>
      <div className="auth-links">
        {mode === 'signin' ? (
          <>
            <button type="button" className="link" onClick={() => switchMode('signup')}>Need an account?</button>
            <button type="button" className="link" onClick={() => switchMode('reset')}>Forgot password?</button>
          </>
        ) : (
          <button type="button" className="link" onClick={() => switchMode('signin')}>
            {mode === 'signup' ? 'Have an account?' : 'Back to sign in'}
          </button>
        )}
      </div>
    </form>
  )
}
