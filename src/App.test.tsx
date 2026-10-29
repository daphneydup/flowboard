import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import App from './App'
import { seedApi } from './test/fakeApi'
import { makeCard, USER_ID } from './test/factories'
import { authMock } from './test/mockSupabase'

vi.mock('./api', async () => (await import('./test/fakeApi')).api)

const session = { user: { id: USER_ID, email: 'ana@example.com' } }

describe('while the session loads', () => {
  it('shows a loading message inside a main landmark, with a skip link', () => {
    authMock.getSession.mockReturnValue(new Promise(() => {}))
    render(<App />)
    expect(within(screen.getByRole('main')).getByText('Loading…')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveAttribute('href', '#main')
  })
})

describe('signed out', () => {
  async function setup() {
    render(<App />)
    await screen.findByRole('heading', { name: 'Sign in' })
  }

  it('shows the sign-in form in the one main landmark', async () => {
    await setup()
    expect(screen.getAllByRole('main')).toHaveLength(1)
    expect(within(screen.getByRole('main')).getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('explains what Flowboard is, as visible text', async () => {
    await setup()
    expect(screen.getByRole('heading', { name: 'A private Kanban board for your team' })).toBeInTheDocument()
    expect(screen.getByText(/Backlog.*In Progress.*In Review.*Done/s)).toBeInTheDocument()
  })

  it('has exactly one h1 and a banner', async () => {
    await setup()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Flowboard')
    expect(screen.getByText('Team Kanban').closest('header')).toBeInTheDocument()
  })

  it('does not load or show the board', async () => {
    await setup()
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
  })
})

describe('signed in', () => {
  async function setup(cards = [makeCard({ title: 'Visible' })]) {
    seedApi(cards)
    authMock.getSession.mockResolvedValue({ data: { session } })
    render(<App />)
    await screen.findByText('Visible', { selector: 'h3' })
  }

  it('shows the board with one main landmark and the user in the header', async () => {
    await setup()
    expect(screen.getAllByRole('main')).toHaveLength(1)
    // (the column <header>s are not page banners in browsers, so find the page header directly)
    const header = screen.getByText('Team Kanban').closest('header') as HTMLElement
    expect(within(header).getByText('ana@example.com')).toBeInTheDocument()
  })

  it('announces that the board has loaded', async () => {
    await setup()
    expect(await screen.findByText('Board loaded')).toBeInTheDocument()
  })

  it('signs out', async () => {
    await setup()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Sign out' }))
    expect(authMock.signOut).toHaveBeenCalled()
  })

  it('offers the theme toggle and background picker', async () => {
    await setup()
    expect(screen.getByRole('button', { name: /theme/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Change board background' })).toBeInTheDocument()
  })

  it('shows people who are not on the team a no-access message, still inside a main landmark', async () => {
    seedApi([], { member: false })
    authMock.getSession.mockResolvedValue({ data: { session } })
    render(<App />)
    const message = await screen.findByText("You don't have access yet")
    expect(message.closest('main')).toBeInTheDocument()
  })
})

describe('password recovery', () => {
  it('shows the new-password form when arriving from a reset link', async () => {
    let notify: (event: string, s: unknown) => void = () => {}
    authMock.onAuthStateChange.mockImplementation((cb: typeof notify) => {
      notify = cb
      return { data: { subscription: { unsubscribe: vi.fn() } } }
    })
    authMock.getSession.mockResolvedValue({ data: { session } })
    seedApi([])
    render(<App />)
    await screen.findByText(/Add your first card/)

    await act(async () => notify('PASSWORD_RECOVERY', session))
    expect(screen.getByRole('heading', { name: 'Set a new password' })).toBeInTheDocument()
    expect(within(screen.getByRole('main')).getByLabelText('New password')).toHaveAttribute('autocomplete', 'new-password')
  })
})
