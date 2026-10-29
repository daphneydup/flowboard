import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Tests run from the project root (npm test), so resolve files from there.
const path = (rel: string) => resolve(process.cwd(), rel)
const read = (rel: string) => readFileSync(path(rel), 'utf8')

const doc = new DOMParser().parseFromString(read('index.html'), 'text/html')
const meta = (key: string, attr = 'name') => doc.querySelector(`meta[${attr}="${key}"]`)?.getAttribute('content') ?? ''
const canonical = doc.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? ''

describe('page title and description', () => {
  it('has a descriptive title that fits in search results', () => {
    const title = doc.title
    expect(title.toLowerCase()).not.toBe('flowboard')
    expect(title).toContain('Flowboard')
    expect(title.length).toBeLessThanOrEqual(60)
  })

  it('has a meta description of a sensible length', () => {
    const d = meta('description')
    expect(d.length).toBeGreaterThanOrEqual(70)
    expect(d.length).toBeLessThanOrEqual(160)
  })

  it('declares the language and viewport', () => {
    expect(doc.documentElement.lang).toBe('en')
    expect(meta('viewport')).toContain('width=device-width')
  })

  it('has a canonical URL, a theme colour for light and dark, and allows indexing', () => {
    expect(canonical).toMatch(/^https:\/\/[^/]+\/$/)
    expect(doc.querySelectorAll('meta[name="theme-color"]')).toHaveLength(2)
    expect(meta('robots')).toContain('index')
    expect(meta('robots')).not.toContain('noindex')
  })
})

describe('Open Graph and Twitter cards', () => {
  it('has the core Open Graph tags with absolute URLs', () => {
    for (const key of ['og:title', 'og:description', 'og:type', 'og:site_name', 'og:image', 'og:image:alt']) {
      expect(meta(key, 'property'), key).not.toBe('')
    }
    expect(meta('og:url', 'property')).toBe(canonical)
    expect(meta('og:image', 'property')).toMatch(/^https:\/\//)
    expect(meta('og:image', 'property').startsWith(canonical)).toBe(true)
  })

  it('has a large-image Twitter card that matches', () => {
    expect(meta('twitter:card')).toBe('summary_large_image')
    expect(meta('twitter:title')).toBe(meta('og:title', 'property'))
    expect(meta('twitter:image')).toBe(meta('og:image', 'property'))
    expect(meta('twitter:image:alt')).not.toBe('')
  })

  it('points to a real, small JPEG preview image', () => {
    const file = new URL(meta('og:image', 'property')).pathname.slice(1)
    expect(existsSync(path(`public/${file}`)), file).toBe(true)
    const bytes = readFileSync(path(`public/${file}`))
    expect([...bytes.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]) // JPEG signature
    expect(bytes.length).toBeLessThan(200_000)
    expect(meta('og:image:width', 'property')).toBe('1200')
    expect(meta('og:image:height', 'property')).toBe('630')
  })
})

describe('structured data and crawlable content', () => {
  it('has valid WebApplication JSON-LD that matches the page', () => {
    const data = JSON.parse(doc.querySelector('script[type="application/ld+json"]')!.textContent!)
    expect(data['@context']).toBe('https://schema.org')
    expect(data['@type']).toBe('WebApplication')
    expect(data.name).toBe('Flowboard')
    expect(data.url).toBe(canonical)
    expect(data.description.length).toBeGreaterThan(40)
  })

  it('ships real text before JavaScript runs, for crawlers that do not run it', () => {
    const root = doc.getElementById('root')!
    expect(root.querySelectorAll('h1')).toHaveLength(1)
    expect(root.querySelector('main')).not.toBeNull()
    expect(root.textContent).toMatch(/Kanban/)
    expect(root.querySelector('noscript')).not.toBeNull()
  })

  it('has no images without alt text', () => {
    for (const img of doc.querySelectorAll('img')) expect(img.hasAttribute('alt')).toBe(true)
    const files = (readdirSync(path('src'), { recursive: true }) as string[]).filter((f) => f.endsWith('.tsx') && !f.includes('.test.'))
    for (const f of files) expect(readFileSync(path(`src/${f}`), 'utf8'), f).not.toMatch(/<img(?![^>]*\balt=)/)
  })
})

describe('robots.txt, sitemap and llms.txt', () => {
  const origin = new URL(canonical).origin

  it('allows crawling and points at the sitemap', () => {
    const robots = read('public/robots.txt')
    expect(robots).toMatch(/^User-agent: \*$/m)
    expect(robots).toMatch(/^Allow: \/$/m)
    expect(robots).not.toMatch(/^Disallow: \/\s*$/m)
    expect(robots).toContain(`Sitemap: ${origin}/sitemap.xml`)
  })

  it('has a valid sitemap listing the canonical page', () => {
    const xml = new DOMParser().parseFromString(read('public/sitemap.xml'), 'application/xml')
    expect(xml.querySelector('parsererror')).toBeNull()
    const locs = [...xml.querySelectorAll('url > loc')].map((l) => l.textContent)
    expect(locs).toContain(canonical)
    expect(xml.querySelector('lastmod')?.textContent).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('describes the site for AI assistants in llms.txt', () => {
    const llms = read('public/llms.txt')
    expect(llms).toMatch(/^# Flowboard/m)
    expect(llms).toContain(canonical)
  })
})

describe('icons and assets', () => {
  it('uses a small custom favicon, not the Vite template logo', () => {
    expect(statSync(path('public/favicon.svg')).size).toBeLessThan(2000)
    expect(read('public/favicon.svg')).not.toContain('#863bff') // the template's purple
  })

  it('has an Apple touch icon, and no leftover template sprite', () => {
    expect(existsSync(path('public/apple-touch-icon.png'))).toBe(true)
    expect(existsSync(path('public/icons.svg'))).toBe(false)
  })
})

describe('deployment headers and performance', () => {
  const config = JSON.parse(read('vercel.json'))
  const headersFor = (source: string) =>
    Object.fromEntries(
      (config.headers.find((h: { source: string }) => h.source === source)?.headers ?? []).map((h: { key: string; value: string }) => [h.key, h.value]),
    ) as Record<string, string>
  const all = headersFor('/(.*)')

  it('sets a strict content security policy', () => {
    const csp = all['Content-Security-Policy']
    expect(csp).toContain("default-src 'self'")
    expect(csp).toMatch(/script-src 'self'(;|$)/) // no inline scripts, no eval
    expect(csp).not.toContain("'unsafe-eval'")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain('https://*.supabase.co')
  })

  it('sets the standard security headers', () => {
    expect(all['X-Content-Type-Options']).toBe('nosniff')
    expect(all['X-Frame-Options']).toBe('DENY')
    expect(all['Referrer-Policy']).toBeTruthy()
    expect(all['Permissions-Policy']).toContain('camera=()')
    expect(all['Strict-Transport-Security']).toMatch(/max-age=\d{7,}/)
  })

  it('caches the fingerprinted assets for a year', () => {
    expect(headersFor('/assets/(.*)')['Cache-Control']).toBe('public, max-age=31536000, immutable')
  })

  it('warms the connection to Supabase', () => {
    expect(doc.querySelector('link[rel="preconnect"]')?.getAttribute('href')).toContain('VITE_SUPABASE_URL')
  })
})
