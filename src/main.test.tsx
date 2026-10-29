import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(async () => {
  vi.resetModules()
  // a module reset also creates a fresh fake Supabase client, so give it its defaults
  const { resetSupabaseMock } = await import('./test/mockSupabase')
  resetSupabaseMock()
  document.body.innerHTML = '<div id="root"></div>'
})

describe('app start-up', () => {
  it('shows a clear message instead of a blank page when Supabase is not configured', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '')
    await import('./main')

    expect(await screen.findByRole('alert')).toHaveTextContent("Flowboard isn't configured")
    expect(screen.getByRole('alert')).toHaveTextContent('VITE_SUPABASE_URL')
  })

  it('starts the app when configured', async () => {
    await import('./main')
    expect(await screen.findByRole('heading', { name: 'Flowboard', level: 1 })).toBeInTheDocument()
  })

  it('applies the theme before the first paint', async () => {
    localStorage.setItem('theme', 'dark')
    await import('./main')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('applies a saved background before the first paint', async () => {
    localStorage.setItem('board-background', JSON.stringify({ kind: 'custom', color: '#336699' }))
    await import('./main')
    expect(document.documentElement.style.getPropertyValue('--page-bg')).toBe('#336699')
  })
})
