import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import BackgroundPicker from './BackgroundPicker'
import { fileToBackground } from '../imageUpload'

vi.mock('../imageUpload', () => ({ fileToBackground: vi.fn() }))

const GOOD = 'data:image/jpeg;base64,AAAA'
const root = () => document.documentElement
const fileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement

async function setup() {
  const user = userEvent.setup()
  render(<BackgroundPicker />)
  await user.click(screen.getByRole('button', { name: 'Change board background' }))
  return user
}

// Like a real visit: press "Upload image…" (the browser's file dialog then takes focus), then pick a file.
async function upload(user: ReturnType<typeof userEvent.setup>, file: File) {
  await user.click(screen.getByRole('button', { name: 'Upload image…' }))
  await user.upload(fileInput(), file)
}

describe('opening and closing', () => {
  it('opens a dialog and reports it to assistive tech', async () => {
    await setup()
    const trigger = screen.getByRole('button', { name: 'Change board background' })
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('dialog', { name: 'Board background' })).toBeInTheDocument()
  })

  it('moves focus to the current choice when it opens, so the keyboard works straight away', async () => {
    await setup()
    expect(screen.getByRole('radio', { name: 'Default' })).toHaveFocus()
  })

  it('closes on Escape and returns focus to the button', async () => {
    const user = await setup()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Change board background' })).toHaveFocus()
  })

  it('closes when you click elsewhere', async () => {
    const user = await setup()
    await user.click(document.body)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('choosing colours', () => {
  it('offers Default and every preset as a named radio', async () => {
    await setup()
    expect(screen.getByRole('radio', { name: 'Default' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Ocean' })).not.toBeChecked()
    expect(screen.getAllByRole('radio').length).toBeGreaterThanOrEqual(21)
  })

  it('applies and remembers a preset', async () => {
    const user = await setup()
    await user.click(screen.getByRole('radio', { name: 'Ocean' }))

    expect(screen.getByRole('radio', { name: 'Ocean' })).toBeChecked()
    expect(root().style.getPropertyValue('--page-bg')).toBe('#0e7490')
    expect(root().style.getPropertyValue('--on-bg')).toBe('#ffffff')
    expect(JSON.parse(localStorage.getItem('board-background') as string)).toEqual({ kind: 'swatch', id: 'ocean' })
  })

  it('applies a custom colour', async () => {
    const user = await setup()
    const input = screen.getByLabelText('Custom color')
    // colour inputs can't be typed into, so set the value the way the browser's picker does
    await user.click(input)
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.change(input, { target: { value: '#ff0000' } })

    expect(root().style.getPropertyValue('--page-bg')).toBe('#ff0000')
    expect(JSON.parse(localStorage.getItem('board-background') as string)).toEqual({ kind: 'custom', color: '#ff0000' })
  })

  it('resets to the default', async () => {
    const user = await setup()
    expect(screen.getByRole('button', { name: 'Reset to default' })).toBeDisabled()
    await user.click(screen.getByRole('radio', { name: 'Forest' }))
    await user.click(screen.getByRole('button', { name: 'Reset to default' }))

    expect(root().style.getPropertyValue('--page-bg')).toBe('')
    expect(screen.getByRole('radio', { name: 'Default' })).toBeChecked()
  })

  it('starts from a saved choice', () => {
    localStorage.setItem('board-background', JSON.stringify({ kind: 'swatch', id: 'plum' }))
    render(<BackgroundPicker />)
    return userEvent.setup().click(screen.getByRole('button', { name: 'Change board background' })).then(() => {
      expect(screen.getByRole('radio', { name: 'Plum' })).toBeChecked()
    })
  })
})

describe('uploading an image', () => {
  const png = () => new File(['x'], 'bg.png', { type: 'image/png' })

  it('only offers image files', async () => {
    await setup()
    expect(fileInput()).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp,image/gif')
  })

  it('applies and saves the processed image', async () => {
    vi.mocked(fileToBackground).mockResolvedValue(GOOD)
    const user = await setup()
    await upload(user, png())

    expect(await screen.findByText('Background updated.')).toBeInTheDocument()
    expect(fileToBackground).toHaveBeenCalledTimes(1)
    expect(root().dataset.bg).toBe('image')
    expect(root().style.getPropertyValue('--page-bg')).toContain(GOOD)
    expect(localStorage.getItem('board-background-image')).toBe(GOOD)
    expect(screen.getByRole('radio', { name: 'Your uploaded image' })).toBeChecked()
  })

  it('shows what is wrong with a bad file and changes nothing', async () => {
    vi.mocked(fileToBackground).mockRejectedValue(new Error('That image is over 10 MB. Choose a smaller one.'))
    const user = await setup()
    await upload(user, png())

    expect(await screen.findByRole('alert')).toHaveTextContent('over 10 MB')
    expect(root().dataset.bg).toBeUndefined()
    expect(screen.getByRole('radio', { name: 'Default' })).toBeChecked()
  })

  it('warns when the device has no room to remember it, but still applies it for now', async () => {
    vi.mocked(fileToBackground).mockResolvedValue(GOOD)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    const user = await setup()
    await upload(user, png())

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't save this on your device")
    expect(root().dataset.bg).toBe('image')
  })

  it('stays open while the file dialog has focus, and can be reset after uploading', async () => {
    vi.mocked(fileToBackground).mockResolvedValue(GOOD)
    const user = await setup()
    await user.click(screen.getByRole('button', { name: 'Upload image…' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await user.upload(fileInput(), png())
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Your uploaded image' })).toBeChecked())
    await user.click(screen.getByRole('button', { name: 'Reset to default' }))
    expect(root().dataset.bg).toBeUndefined()
    expect(localStorage.getItem('board-background-image')).toBeNull()
  })

  it('tells people where the image is stored', async () => {
    await setup()
    expect(screen.getByText(/Stored only on this device/)).toBeInTheDocument()
  })
})
