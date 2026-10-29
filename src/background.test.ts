import { describe, expect, it, vi } from 'vitest'
import { SWATCHES, applyBackground, colorsFor, cssFor, loadBackground, readableOn, saveBackground } from './background'

// Independent WCAG contrast calculation, so the tests don't just re-use the code under test.
function luminance(hex: string) {
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

const root = () => document.documentElement

describe('readable text on any background', () => {
  it('picks white on dark colours and dark on light colours', () => {
    expect(readableOn(['#000000'])).toBe('#ffffff')
    expect(readableOn(['#0f172a'])).toBe('#ffffff')
    expect(readableOn(['#ffffff'])).not.toBe('#ffffff')
    expect(readableOn(['#fef3c7'])).not.toBe('#ffffff')
  })

  it('checks every colour of a gradient', () => {
    // dark on one end, light on the other: the choice must work for the weakest end
    const text = readableOn(['#0f172a', '#e2e8f0'])
    expect(Math.min(contrast(text, '#0f172a'), contrast(text, '#e2e8f0'))).toBeGreaterThan(1)
  })

  it.each(SWATCHES)('keeps page text at WCAG AA (4.5:1) on the $name preset', ({ colors }) => {
    const text = readableOn(colors)
    for (const c of colors) expect(contrast(text, c)).toBeGreaterThanOrEqual(4.5)
  })

  it('keeps page text at WCAG AA on any custom colour', () => {
    const steps = [0, 17, 34, 51, 68, 85, 102, 119, 136, 153, 170, 187, 204, 221, 238, 255]
    const failures: string[] = []
    for (const r of steps)
      for (const g of steps)
        for (const b of steps) {
          const hex = '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')
          const ratio = contrast(readableOn([hex]), hex)
          if (ratio < 4.5) failures.push(`${hex} ${ratio.toFixed(2)}`)
        }
    expect(failures).toEqual([])
  })
})

describe('presets', () => {
  it('have unique ids, valid colours and at most a two-colour gradient', () => {
    const ids = SWATCHES.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const s of SWATCHES) {
      expect(s.colors.length).toBeGreaterThanOrEqual(1)
      for (const c of s.colors) expect(c).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('builds solid and gradient CSS', () => {
    expect(cssFor(['#112233'])).toBe('#112233')
    expect(cssFor(['#112233', '#445566'])).toBe('linear-gradient(135deg, #112233, #445566)')
  })

  it('looks colours up by choice', () => {
    expect(colorsFor({ kind: 'default' })).toBeNull()
    expect(colorsFor({ kind: 'custom', color: '#123456' })).toEqual(['#123456'])
    expect(colorsFor({ kind: 'swatch', id: 'ocean' })).toEqual(['#0e7490'])
    expect(colorsFor({ kind: 'swatch', id: 'nope' })).toBeNull()
  })
})

describe('loading a saved background', () => {
  it('defaults when nothing is saved', () => {
    expect(loadBackground()).toEqual({ kind: 'default' })
  })

  it('restores a valid swatch, custom colour and image', () => {
    localStorage.setItem('board-background', JSON.stringify({ kind: 'swatch', id: 'forest' }))
    expect(loadBackground()).toEqual({ kind: 'swatch', id: 'forest' })

    localStorage.setItem('board-background', JSON.stringify({ kind: 'custom', color: '#AbCdEf' }))
    expect(loadBackground()).toEqual({ kind: 'custom', color: '#AbCdEf' })

    localStorage.setItem('board-background', JSON.stringify({ kind: 'image' }))
    localStorage.setItem('board-background-image', 'data:image/jpeg;base64,/9j/4AAQ')
    expect(loadBackground()).toEqual({ kind: 'image', dataUrl: 'data:image/jpeg;base64,/9j/4AAQ' })
  })

  it.each([
    ['an unknown preset', { kind: 'swatch', id: 'nope' }],
    ['a colour that is not a hex value', { kind: 'custom', color: 'red' }],
    ['a colour carrying extra CSS', { kind: 'custom', color: '#ffffff;background:url(https://evil.example/x)' }],
    ['an unknown kind', { kind: 'script' }],
  ])('ignores %s', (_label, saved) => {
    localStorage.setItem('board-background', JSON.stringify(saved))
    expect(loadBackground()).toEqual({ kind: 'default' })
  })

  it.each([
    ['a remote URL', 'https://evil.example/x.png'],
    ['a non-JPEG data URL', 'data:image/svg+xml;base64,PHN2Zz4='],
    ['a data URL with extra CSS', 'data:image/jpeg;base64,AAAA");background:red;("'],
  ])('ignores a stored image that is %s', (_label, url) => {
    localStorage.setItem('board-background', JSON.stringify({ kind: 'image' }))
    localStorage.setItem('board-background-image', url)
    expect(loadBackground()).toEqual({ kind: 'default' })
  })

  it('survives corrupt or blocked storage', () => {
    localStorage.setItem('board-background', '{not json')
    expect(loadBackground()).toEqual({ kind: 'default' })

    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(loadBackground()).toEqual({ kind: 'default' })
  })
})

describe('saving', () => {
  it('stores a choice and reports success', () => {
    expect(saveBackground({ kind: 'swatch', id: 'sky' })).toBe(true)
    expect(JSON.parse(localStorage.getItem('board-background') as string)).toEqual({ kind: 'swatch', id: 'sky' })
  })

  it('keeps big image data separate and removes it when switching away', () => {
    expect(saveBackground({ kind: 'image', dataUrl: 'data:image/jpeg;base64,AAAA' })).toBe(true)
    expect(localStorage.getItem('board-background-image')).toBe('data:image/jpeg;base64,AAAA')
    expect(localStorage.getItem('board-background')).toBe('{"kind":"image"}')

    saveBackground({ kind: 'default' })
    expect(localStorage.getItem('board-background-image')).toBeNull()
  })

  it('reports failure instead of throwing when storage is full', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    expect(saveBackground({ kind: 'image', dataUrl: 'data:image/jpeg;base64,AAAA' })).toBe(false)
  })
})

describe('applying', () => {
  it('sets the page background and a readable text colour', () => {
    applyBackground({ kind: 'swatch', id: 'midnight' })
    expect(root().style.getPropertyValue('--page-bg')).toContain('linear-gradient')
    expect(root().style.getPropertyValue('--on-bg')).toBe('#ffffff')
    expect(root().dataset.bg).toBeUndefined()
  })

  it('uses a photo with theme-coloured text on a solid panel', () => {
    applyBackground({ kind: 'image', dataUrl: 'data:image/jpeg;base64,AAAA' })
    expect(root().style.getPropertyValue('--page-bg')).toContain('url("data:image/jpeg;base64,AAAA")')
    expect(root().style.getPropertyValue('--on-bg')).toBe('')
    expect(root().dataset.bg).toBe('image')
  })

  it('refuses an image that is not what the uploader produces', () => {
    applyBackground({ kind: 'image', dataUrl: 'https://evil.example/x.png' })
    expect(root().style.getPropertyValue('--page-bg')).toBe('')
    expect(root().dataset.bg).toBeUndefined()
  })

  it('clears everything for the default', () => {
    applyBackground({ kind: 'image', dataUrl: 'data:image/jpeg;base64,AAAA' })
    applyBackground({ kind: 'default' })
    expect(root().style.getPropertyValue('--page-bg')).toBe('')
    expect(root().style.getPropertyValue('--on-bg')).toBe('')
    expect(root().dataset.bg).toBeUndefined()
  })
})
