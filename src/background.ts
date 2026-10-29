export interface Swatch {
  id: string
  name: string
  colors: string[] // one colour = solid, several = diagonal gradient
}

export type BgChoice =
  | { kind: 'default' }
  | { kind: 'swatch'; id: string }
  | { kind: 'custom'; color: string }
  | { kind: 'image'; dataUrl: string }

export const SWATCHES: Swatch[] = [
  { id: 'slate', name: 'Slate', colors: ['#334155'] },
  { id: 'ocean', name: 'Ocean', colors: ['#0e7490'] },
  { id: 'forest', name: 'Forest', colors: ['#166534'] },
  { id: 'plum', name: 'Plum', colors: ['#7e22ce'] },
  { id: 'rose', name: 'Rose', colors: ['#be123c'] },
  { id: 'charcoal', name: 'Charcoal', colors: ['#1f2937'] },
  { id: 'sand', name: 'Sand', colors: ['#fef3c7'] },
  { id: 'sky', name: 'Sky', colors: ['#dbeafe'] },
  { id: 'mint', name: 'Mint', colors: ['#d1fae5'] },
  { id: 'lavender', name: 'Lavender', colors: ['#ede9fe'] },
  { id: 'blush', name: 'Blush', colors: ['#ffe4e6'] },
  { id: 'cloud', name: 'Cloud', colors: ['#e2e8f0'] },
  { id: 'aurora', name: 'Aurora', colors: ['#0f766e', '#1d4ed8'] },
  { id: 'dusk', name: 'Dusk', colors: ['#4338ca', '#7e22ce'] },
  { id: 'midnight', name: 'Midnight', colors: ['#0f172a', '#1e3a8a'] },
  { id: 'berry', name: 'Berry', colors: ['#9d174d', '#6d28d9'] },
  { id: 'sunrise', name: 'Sunrise', colors: ['#fde68a', '#fbcfe8'] },
  { id: 'lagoon', name: 'Lagoon', colors: ['#a5f3fc', '#bfdbfe'] },
  { id: 'meadow', name: 'Meadow', colors: ['#bbf7d0', '#fef9c3'] },
  { id: 'peach', name: 'Peach', colors: ['#fed7aa', '#fecdd3'] },
]

const KEY = 'board-background'
const IMAGE_KEY = 'board-background-image'
const IMAGE_URL = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/ // only what our own uploader produces
const HEX = /^#[0-9a-f]{6}$/i
const LIGHT_TEXT = '#ffffff'
const DARK_TEXT = '#000000' // must be pure black: anything lighter drops mid-tone colours below 4.5:1

export const cssFor = (colors: string[]) =>
  colors.length === 1 ? colors[0] : `linear-gradient(135deg, ${colors.join(', ')})`

export const colorsFor = (choice: BgChoice): string[] | null => {
  if (choice.kind === 'custom') return [choice.color]
  if (choice.kind === 'swatch') return SWATCHES.find((s) => s.id === choice.id)?.colors ?? null
  return null
}

function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2)
}

const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

// Pick white or dark text, whichever reads better on the weakest part of the background.
export function readableOn(colors: string[]): string {
  const worst = (text: string) => Math.min(...colors.map((c) => contrast(text, c)))
  return worst(LIGHT_TEXT) >= worst(DARK_TEXT) ? LIGHT_TEXT : DARK_TEXT
}

export function loadBackground(): BgChoice {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as BgChoice
      if (parsed.kind === 'swatch' && SWATCHES.some((s) => s.id === parsed.id)) return parsed
      if (parsed.kind === 'custom' && HEX.test(parsed.color)) return parsed
      if (parsed.kind === 'image') {
        const dataUrl = localStorage.getItem(IMAGE_KEY)
        if (dataUrl && IMAGE_URL.test(dataUrl)) return { kind: 'image', dataUrl }
      }
    }
  } catch {
    // storage unavailable or corrupt; use the default
  }
  return { kind: 'default' }
}

// Returns false if the browser refused to store it (for example, storage is full).
export function saveBackground(choice: BgChoice): boolean {
  try {
    if (choice.kind === 'image') {
      localStorage.setItem(IMAGE_KEY, choice.dataUrl)
      localStorage.setItem(KEY, JSON.stringify({ kind: 'image' }))
    } else {
      localStorage.setItem(KEY, JSON.stringify(choice))
      localStorage.removeItem(IMAGE_KEY)
    }
    return true
  } catch {
    return false
  }
}

export function applyBackground(choice: BgChoice) {
  const root = document.documentElement
  const style = root.style
  if (choice.kind === 'image' && IMAGE_URL.test(choice.dataUrl)) {
    style.setProperty('--page-bg', `url("${choice.dataUrl}") center / cover no-repeat`)
    style.removeProperty('--on-bg') // text sits on a solid panel over photos, so keep theme colours
    root.dataset.bg = 'image'
    return
  }
  delete root.dataset.bg
  const colors = colorsFor(choice)
  if (!colors) {
    style.removeProperty('--page-bg')
    style.removeProperty('--on-bg')
    return
  }
  style.setProperty('--page-bg', cssFor(colors))
  style.setProperty('--on-bg', readableOn(colors))
}
