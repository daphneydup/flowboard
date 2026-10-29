import { Suspense, lazy, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import Auth from './components/Auth'
import ThemeToggle from './components/ThemeToggle'
import BackgroundPicker from './components/BackgroundPicker'
import ResetPassword from './components/ResetPassword'

// The board (and its modal, calendar and picker) only loads after sign-in.
const Board = lazy(() => import('./components/Board'))

const Loading = ({ label }: { label: string }) => (
  <main id="main" tabIndex={-1}>
    <p className="status"><span className="spinner" aria-hidden="true" />{label}</p>
  </main>
)

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [recovering, setRecovering] = useState(false)
  const [announce, setAnnounce] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  let view
  if (!ready) {
    view = <Loading label="Loading…" />
  } else if (session && recovering) {
    view = (
      <main id="main" tabIndex={-1} className="overlay-static">
        <ResetPassword onDone={() => setRecovering(false)} />
      </main>
    )
  } else if (session) {
    view = (
      <Suspense fallback={<Loading label="Loading board…" />}>
        <Board userId={session.user.id} onStatus={setAnnounce} />
      </Suspense>
    )
  } else {
    view = (
      <main id="main" tabIndex={-1} className="overlay-static">
        <div className="signin">
          <h2 className="intro-title">A private Kanban board for your team</h2>
          <p className="intro">
            Flowboard helps teams plan and track work. Add cards to a Backlog, move them through In Progress and
            In Review, and mark them Done. Give each card an assignee, a priority and a due date.
          </p>
          <Auth />
        </div>
      </main>
    )
  }

  return (
    <div className="app">
      <a className="skip-link" href="#main">Skip to main content</a>
      <div className="sr-only" role="status" aria-live="polite">{ready ? announce : 'Loading…'}</div>
      <header className="app-header">
        <h1>Flowboard</h1>
        <p>Team Kanban</p>
        <div className="header-tools">
          <BackgroundPicker />
          <ThemeToggle />
          {session && (
            <div className="user">
              <span>{session.user.email}</span>
              <button type="button" onClick={() => supabase.auth.signOut()}>Sign out</button>
            </div>
          )}
        </div>
      </header>
      {view}
    </div>
  )
}
