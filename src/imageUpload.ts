const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const MAX_INPUT_BYTES = 10 * 1024 * 1024
const MAX_EDGE = 1920
const MAX_DATA_URL_CHARS = 1_800_000 // keeps well inside the browser's ~5 MB localStorage quota

// Decode the file, shrink it, and re-encode as JPEG. Re-encoding also drops any
// embedded metadata (such as GPS location), and SVG is never accepted.
export async function fileToBackground(file: File): Promise<string> {
  if (!ALLOWED.includes(file.type)) throw new Error('Choose a JPEG, PNG, WebP or GIF image.')
  if (file.size > MAX_INPUT_BYTES) throw new Error('That image is over 10 MB. Choose a smaller one.')

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error("That file couldn't be read as an image.")
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error("Your browser can't process images.")
  ctx.fillStyle = '#ffffff' // flatten transparency
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  for (const quality of [0.82, 0.7, 0.55, 0.4]) {
    const url = canvas.toDataURL('image/jpeg', quality)
    if (url.length <= MAX_DATA_URL_CHARS) return url
  }
  throw new Error('That image is too detailed to store. Try a smaller one.')
}
