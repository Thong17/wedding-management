/**
 * Shrink a picture in the browser before uploading it, so phone photos upload as a few hundred KB
 * instead of several MB. `square` center-crops to a square first (profile pictures). PNG keeps
 * transparency (logos, emblems); JPEG gets a white background. Throws if the file isn't a readable image.
 */
export async function resizeImage(
  file: Blob,
  { maxSide, square = false, type = 'image/jpeg', quality = 0.88 }: { maxSide: number; square?: boolean; type?: 'image/jpeg' | 'image/png'; quality?: number },
): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const side = Math.min(bitmap.width, bitmap.height)
  const [sx, sy, sw, sh] = square
    ? [(bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side]
    : [0, 0, bitmap.width, bitmap.height]
  const scale = Math.min(1, maxSide / Math.max(sw, sh))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(sw * scale)
  canvas.height = Math.round(sh * scale)
  const ctx = canvas.getContext('2d')!
  if (type === 'image/jpeg') {
    ctx.fillStyle = '#fff' // JPEG has no transparency
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality))
  if (!blob) throw new Error('unreadable image')
  return blob
}
