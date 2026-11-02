import { intlLocale, t } from '@/i18n'
import type { GiftMethod, GuestSide } from '@/offline/db'

export function formatMoney(amount: string | number | null | undefined, currency: string): string {
  const n = Number(amount ?? 0)
  try {
    return new Intl.NumberFormat(intlLocale(), { style: 'currency', currency }).format(n)
  } catch {
    return `${n.toFixed(2)} ${currency}`
  }
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(intlLocale(), { dateStyle: 'medium', timeStyle: 'short' })
}

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return t('time.never')
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000)
  if (s < 10) return t('time.justNow')
  if (s < 60) return t('time.seconds', { n: s })
  if (s < 3600) return t('time.minutes', { n: Math.round(s / 60) })
  if (s < 86400) return t('time.hours', { n: Math.round(s / 3600) })
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

const METHODS: GiftMethod[] = ['cash', 'transfer', 'other']
const SIDES: GuestSide[] = ['bride', 'groom', 'both']

export const methodLabel = (m: GiftMethod): string => t(`method.${m}`)
export const sideLabel = (s: GuestSide): string => t(`side.${s}`)

// Functions, not constants, so labels follow a language switch when called from a template.
export const methodOptions = () => METHODS.map((value) => ({ value, label: methodLabel(value) }))
export const sideOptions = () => SIDES.map((value) => ({ value, label: sideLabel(value) }))
