import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import Auth from './Auth'
import { authMock } from '../test/mockSupabase'

function setup() {
  render(<Auth />)
  return userEvent.setup()
}
const email = () => screen.getByRole('textbox', { name: 'Email' })
const password = () => screen.getByLabelText('Password')

async function fillIn(user: ReturnType<typeof userEvent.setup>) {
  await user.type(email(), 'ana@example.com')
  await user.type(password(), 'secret123')
}

describe('signing in', () => {
  it('sends the email and password', async () => {
    const user = setup()
    await fillIn(user)
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(authMock.signInWithPassword).toHaveBeenCalledWith({ email: 'ana@example.com', password: 'secret123' })
  })

  it('shows what is happening while it works', async () => {
    authMock.signInWithPassword.mockReturnValue(new Promise(() => {}))
    const user = setup()
    await fillIn(user)
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(screen.getByRole('button', { name: 'Signing in…' })).toBeDisabled()
  })

  it('shows the error in an alert', async () => {
    authMock.signInWithPassword.mockResolvedValue({ data: {}, error: { message: 'Invalid login credentials' } })
    const user = setup()
    await fillIn(user)
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid login credentials')
  })

  it('never leaves the button stuck disabled when the network fails', async () => {
    authMock.signInWithPassword.mockRejectedValue(new TypeError('Failed to fetch'))
    const user = setup()
    await fillIn(user)
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Network error. Check your connection and try again.')
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled()
  })

  it('helps password managers and browsers autofill', () => {
    setup()
    expect(email()).toHaveAttribute('autocomplete', 'email')
    expect(password()).toHaveAttribute('autocomplete', 'current-password')
    expect(password()).toHaveAttribute('minlength', '6')
  })

  it('keeps empty message areas in the page so screen readers announce them when they fill', () => {
    setup()
    expect(screen.getByRole('alert')).toBeEmptyDOMElement()
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })
})

describe('creating an account', () => {
  async function toSignUp() {
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'Need an account?' }))
    return user
  }

  it('moves focus to the new heading, because the button that was pressed disappears', async () => {
    await toSignUp()
    const heading = screen.getByRole('heading', { name: 'Create account' })
    expect(heading).toHaveFocus()
  })

  it('asks for a new password autofill and signs up', async () => {
    const user = await toSignUp()
    expect(password()).toHaveAttribute('autocomplete', 'new-password')
    await fillIn(user)
    await user.click(screen.getByRole('button', { name: 'Sign up' }))
    expect(authMock.signUp).toHaveBeenCalledWith({ email: 'ana@example.com', password: 'secret123' })
  })

  it('tells people to check their email and offers to resend the confirmation', async () => {
    const user = await toSignUp()
    await fillIn(user)
    await user.click(screen.getByRole('button', { name: 'Sign up' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Check your email to confirm your account')
    await user.click(screen.getByRole('button', { name: 'Resend confirmation email' }))

    expect(authMock.resend).toHaveBeenCalledWith({ type: 'signup', email: 'ana@example.com' })
    expect(await screen.findByText('Confirmation email sent again.')).toBeInTheDocument()
  })

  it('goes straight in when confirmation is switched off', async () => {
    authMock.signUp.mockResolvedValue({ data: { session: { access_token: 'x' } }, error: null })
    const user = await toSignUp()
    await fillIn(user)
    await user.click(screen.getByRole('button', { name: 'Sign up' }))
    expect(screen.queryByText(/Check your email/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Resend confirmation email' })).not.toBeInTheDocument()
  })

  it('hides the resend button after going back to sign in', async () => {
    const user = await toSignUp()
    await fillIn(user)
    await user.click(screen.getByRole('button', { name: 'Sign up' }))
    await screen.findByRole('button', { name: 'Resend confirmation email' })

    await user.click(screen.getByRole('button', { name: 'Have an account?' }))
    expect(screen.queryByRole('button', { name: 'Resend confirmation email' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Sign in' })).toHaveFocus()
  })
})

describe('forgot password', () => {
  it('asks only for an email and sends a reset link', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'Forgot password?' }))
    expect(screen.getByRole('heading', { name: 'Reset password' })).toHaveFocus()
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument()

    await user.type(email(), 'ana@example.com')
    await user.click(screen.getByRole('button', { name: 'Send reset link' }))

    expect(authMock.resetPasswordForEmail).toHaveBeenCalledWith('ana@example.com', { redirectTo: window.location.origin })
    expect(await screen.findByRole('status')).toHaveTextContent('a reset link is on its way')
  })

  it('does not reveal whether an account exists', async () => {
    authMock.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null })
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'Forgot password?' }))
    await user.type(email(), 'nobody@example.com')
    await user.click(screen.getByRole('button', { name: 'Send reset link' }))
    expect(await screen.findByRole('status')).toHaveTextContent('If that email has an account')
  })

  it('goes back to sign in', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'Forgot password?' }))
    await user.click(screen.getByRole('button', { name: 'Back to sign in' }))
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })
})
