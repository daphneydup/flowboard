import { useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../supabase'

export default function ResetPassword({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) setError(error.message)
      else onDone()
    } catch {
      setError('Network error. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="modal auth" onSubmit={submit}>
      <h2>Set a new password</h2>
      <label>
        New password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={6}
          required
          autoFocus
          autoComplete="new-password"
        />
      </label>
      <div className="msgs">
        <p className="error" role="alert">{error}</p>
      </div>
      <div className="modal-actions">
        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save password'}
        </button>
      </div>
    </form>
  )
}
