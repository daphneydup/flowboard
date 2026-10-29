import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { initialTheme } from './theme'
import ThemeToggle from './components/ThemeToggle'

const prefersDark = (dark: boolean) => {
  window.matchMedia = ((q: string) => ({ matches: dark, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia
}

describe('initialTheme', () => {
  it('uses the saved choice first', () => {
    localStorage.setItem('theme', 'dark')
    prefersDark(false)
    expect(initialTheme()).toBe('dark')
  })

  it('falls back to the system preference', () => {
    prefersDark(true)
    expect(initialTheme()).toBe('dark')
    prefersDark(false)
    expect(initialTheme()).toBe('light')
  })

  it('ignores junk in storage', () => {
    localStorage.setItem('theme', 'purple')
    prefersDark(false)
    expect(initialTheme()).toBe('light')
  })

  it('still works when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    prefersDark(true)
    expect(initialTheme()).toBe('dark')
  })
})

describe('ThemeToggle', () => {
  it('names the theme it will switch to, applies it, and remembers it', async () => {
    prefersDark(false)
    const user = userEvent.setup()
    render(<ThemeToggle />)

    await user.click(screen.getByRole('button', { name: 'Switch to dark theme' }))
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(localStorage.getItem('theme')).toBe('dark')

    await user.click(screen.getByRole('button', { name: 'Switch to light theme' }))
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(localStorage.getItem('theme')).toBe('light')
  })

  it('hides the decorative icon from screen readers', () => {
    prefersDark(false)
    render(<ThemeToggle />)
    expect(screen.getByRole('button').querySelector('[aria-hidden="true"]')).toBeInTheDocument()
  })
})
