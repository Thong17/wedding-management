import type { GiftMethod, GuestSide } from '@/offline/db'

export function formatMoney(amount: string | number | null | undefined, currency: string): string {
  const n = Number(amount ?? 0)
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(n)
  } catch {
    return `${n.toFixed(2)} ${currency}`
  }
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return 'never'
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000)
  if (s < 10) return 'just now'
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  return formatDateTime(iso)
}

export function downloadFile(filename: string, content: BlobPart, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const METHOD_LABELS: Record<GiftMethod, string> = { cash: 'Cash', transfer: 'Bank transfer', other: 'Other' }
export const SIDE_LABELS: Record<GuestSide, string> = { bride: 'Bride', groom: 'Groom', both: 'Both' }

/** Turn a label map into AppSelect options, keeping the map's order. */
export function labelOptions<T extends string>(labels: Record<T, string>): { value: T; label: string }[] {
  return (Object.keys(labels) as T[]).map((value) => ({ value, label: labels[value] }))
}
export const METHOD_OPTIONS = labelOptions(METHOD_LABELS)
export const SIDE_OPTIONS = labelOptions(SIDE_LABELS)
