import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'
import { resetSupabaseMock } from './mockSupabase'

// Every test gets the fake Supabase client; the real one is never constructed.
vi.mock('../supabase', async () => import('./mockSupabase'))

const defaultMatchMedia = (query: string) =>
  ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }) as MediaQueryList

beforeEach(() => {
  resetSupabaseMock()
  // Belt and braces: if anything tries a real network call, fail loudly.
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      throw new Error('Network access is blocked in tests')
    }),
  )
  // Testing Library only advances fake timers when it sees a `jest` global; point it at Vitest.
  vi.stubGlobal('jest', { advanceTimersByTime: (ms: number) => vi.advanceTimersByTime(ms) })
  vi.stubEnv('VITE_SUPABASE_URL', 'http://localhost:54321')
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'test-publishable-key')
  window.matchMedia = defaultMatchMedia
  localStorage.clear()
  const root = document.documentElement
  root.removeAttribute('style')
  root.removeAttribute('data-theme')
  root.removeAttribute('data-bg')
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})
