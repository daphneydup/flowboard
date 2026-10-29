import { describe, expect, it, vi } from 'vitest'
import { fileToBackground } from './imageUpload'

const file = (type = 'image/jpeg', size?: number) => {
  const f = new File(['x'], 'photo', { type })
  if (size !== undefined) Object.defineProperty(f, 'size', { value: size })
  return f
}

// jsdom has no canvas or image decoding, so stand in for both and record what happens.
function stubBrowser(width = 4000, height = 2000, dataUrls = ['data:image/jpeg;base64,AAAA']) {
  const bitmap = { width, height, close: vi.fn() }
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap))
  const ctx = { fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as never)
  const qualities: unknown[] = []
  const size = { width: 0, height: 0 }
  let i = 0
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(function (this: HTMLCanvasElement, type?: string, quality?: unknown) {
    size.width = this.width
    size.height = this.height
    qualities.push([type, quality])
    return dataUrls[Math.min(i++, dataUrls.length - 1)]
  })
  return { bitmap, ctx, qualities, size }
}

describe('fileToBackground: what it accepts', () => {
  it.each(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])('accepts %s', async (type) => {
    stubBrowser()
    await expect(fileToBackground(file(type))).resolves.toMatch(/^data:image\/jpeg;base64,/)
  })

  it.each(['image/svg+xml', 'text/html', 'application/pdf', 'image/bmp', ''])('rejects "%s"', async (type) => {
    stubBrowser()
    await expect(fileToBackground(file(type))).rejects.toThrow('Choose a JPEG, PNG, WebP or GIF image.')
    expect(createImageBitmap).not.toHaveBeenCalled()
  })

  it('rejects files over 10 MB before reading them', async () => {
    stubBrowser()
    await expect(fileToBackground(file('image/png', 10 * 1024 * 1024 + 1))).rejects.toThrow('over 10 MB')
    expect(createImageBitmap).not.toHaveBeenCalled()
  })

  it('accepts a file of exactly 10 MB', async () => {
    stubBrowser()
    await expect(fileToBackground(file('image/png', 10 * 1024 * 1024))).resolves.toBeTruthy()
  })

  it('says so when the file is not really an image', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('bad')))
    await expect(fileToBackground(file('image/png'))).rejects.toThrow("couldn't be read as an image")
  })
})

describe('fileToBackground: what it produces', () => {
  it('shrinks large images to 1920px on the long edge, keeping the shape', async () => {
    const { size } = stubBrowser(4000, 2000)
    await fileToBackground(file())
    expect(size).toEqual({ width: 1920, height: 960 })
  })

  it('shrinks tall images the same way', async () => {
    const { size } = stubBrowser(1000, 3000)
    await fileToBackground(file())
    expect(size).toEqual({ width: 640, height: 1920 })
  })

  it('never enlarges a small image', async () => {
    const { size } = stubBrowser(100, 50)
    await fileToBackground(file())
    expect(size).toEqual({ width: 100, height: 50 })
  })

  it('re-encodes as JPEG on a white background, which also drops metadata such as GPS location', async () => {
    const { ctx, qualities, bitmap } = stubBrowser()
    await fileToBackground(file('image/png'))
    expect(ctx.fillStyle).toBe('#ffffff')
    expect(ctx.fillRect).toHaveBeenCalled()
    expect(ctx.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 1920, 960)
    expect(qualities[0]).toEqual(['image/jpeg', 0.82])
    expect(bitmap.close).toHaveBeenCalled()
  })

  it('lowers the quality until the result fits in storage', async () => {
    const huge = 'data:image/jpeg;base64,' + 'A'.repeat(2_000_000)
    const { qualities } = stubBrowser(4000, 2000, [huge, huge, 'data:image/jpeg;base64,small'])
    await expect(fileToBackground(file())).resolves.toBe('data:image/jpeg;base64,small')
    expect(qualities.map((q) => (q as unknown[])[1])).toEqual([0.82, 0.7, 0.55])
  })

  it('gives up with a clear message when even the lowest quality is too big', async () => {
    const huge = 'data:image/jpeg;base64,' + 'A'.repeat(2_000_000)
    stubBrowser(4000, 2000, [huge])
    await expect(fileToBackground(file())).rejects.toThrow('too detailed')
  })
})
