/**
 * Prepare a photo of a name for OCR. Khmer is hard on OCR: stacked subscript consonants (coeng) and
 * vowel signs above/below are small, and invitation cards are often gold or white text on a dark or
 * patterned background. So: bring the image to a size the engine reads well, convert to grayscale,
 * stretch the contrast, and make the text dark on light.
 */

/**
 * The image's longer side is scaled (up or down) to about this many pixels. Text that is too big
 * reads as badly as text that is too small: a handwritten name photographed close up was lost when
 * the photo was doubled, and read well at this size.
 */
export const TARGET_LONG_SIDE = 1600
const MAX_SCALE = 3

export type Rgb = [number, number, number]
export interface Box { x0: number; y0: number; x1: number; y1: number }

export interface PreparedImage {
  /** The cleaned-up image to hand to the OCR engine. */
  canvas: HTMLCanvasElement
  /** The ink colour of the text inside a box (in canvas pixels), from the original photo. */
  textColor(box: Box): Rgb | null
}

export async function prepareForOcr(image: Blob, longSide = TARGET_LONG_SIDE): Promise<PreparedImage> {
  // Phone photos store their rotation separately (EXIF); without this they can arrive sideways.
  const bitmap = await createImageBitmap(image, { imageOrientation: 'from-image' })
  const scale = Math.min(MAX_SCALE, longSide / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()

  const img = ctx.getImageData(0, 0, w, h)
  const px = img.data
  const original = new Uint8ClampedArray(px) // colours, before they're turned into grey
  const gray = new Uint8ClampedArray(w * h)
  const histogram = new Uint32Array(256)
  for (let i = 0, p = 0; i < px.length; i += 4, p++) {
    const g = (px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114) / 1000
    gray[p] = g
    histogram[gray[p]]++
  }

  // Contrast stretch between the 2nd and 98th percentile, ignoring stray dark/bright specks.
  const lo = percentile(histogram, gray.length, 0.02)
  const hi = Math.max(lo + 1, percentile(histogram, gray.length, 0.98))
  // Mostly-dark card = light text on a dark card: invert so the text is dark on light. Judged on the
  // middle of the image only, where the name is: a light card photographed on a dark table must
  // not count as dark.
  const centre = new Uint32Array(256)
  let centreCount = 0
  for (let y = Math.floor(h / 4); y < Math.ceil((h * 3) / 4); y++) {
    for (let x = Math.floor(w / 4); x < Math.ceil((w * 3) / 4); x++) {
      centre[gray[y * w + x]]++
      centreCount++
    }
  }
  const invert = percentile(centre, centreCount, 0.5) < 110

  for (let i = 0, p = 0; i < px.length; i += 4, p++) {
    let v = ((gray[p] - lo) * 255) / (hi - lo)
    if (invert) v = 255 - v
    px[i] = px[i + 1] = px[i + 2] = v
  }
  ctx.putImageData(img, 0, 0)

  function textColor(box: Box): Rgb | null {
    const x0 = Math.max(0, Math.floor(box.x0))
    const y0 = Math.max(0, Math.floor(box.y0))
    const x1 = Math.min(w, Math.ceil(box.x1))
    const y1 = Math.min(h, Math.ceil(box.y1))
    if (x1 <= x0 || y1 <= y0) return null
    // In the prepared image the text is the dark part: average the original colour of the
    // darkest quarter of the box's pixels.
    const local = new Uint32Array(256)
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) local[px[(y * w + x) * 4]]++
    const cutoff = percentile(local, (x1 - x0) * (y1 - y0), 0.25)
    const sum: Rgb = [0, 0, 0]
    let n = 0
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * w + x) * 4
        if (px[i] > cutoff) continue
        sum[0] += original[i]
        sum[1] += original[i + 1]
        sum[2] += original[i + 2]
        n++
      }
    }
    return n ? [sum[0] / n, sum[1] / n, sum[2] / n] : null
  }

  return { canvas, textColor }
}

function percentile(histogram: Uint32Array, total: number, fraction: number): number {
  const target = total * fraction
  let seen = 0
  for (let v = 0; v < 256; v++) {
    seen += histogram[v]
    if (seen >= target) return v
  }
  return 255
}
