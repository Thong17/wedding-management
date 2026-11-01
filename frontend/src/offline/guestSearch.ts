import Fuse from 'fuse.js'
import type { CachedGuest } from './db'

/** Lowercase and strip accents so "Garcia" finds "García" and "nguyen" finds "Nguyễn". */
export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

const digitsOnly = (s: string) => s.replace(/\D/g, '')

interface Indexed {
  guest: CachedGuest
  name: string
  nickname: string
  group: string
  phone: string
}

export interface GuestSearcher {
  search(query: string, limit?: number): CachedGuest[]
  /** Every guest, in name order. */
  all(): CachedGuest[]
}

export function createGuestSearcher(guests: CachedGuest[]): GuestSearcher {
  const docs: Indexed[] = guests.map((g) => ({
    guest: g,
    name: normalizeText(g.full_name),
    nickname: normalizeText(g.nickname),
    group: normalizeText(`${g.group} ${g.table_no}`),
    phone: digitsOnly(g.phone),
  }))
  const fuse = new Fuse(docs, {
    keys: [
      { name: 'name', weight: 0.6 },
      { name: 'nickname', weight: 0.3 },
      { name: 'group', weight: 0.1 },
    ],
    threshold: 0.38,
    ignoreLocation: true,
    includeScore: true,
  })

  const sorted = [...guests].sort((a, b) => a.full_name.localeCompare(b.full_name))

  return {
    all: () => sorted,
    search(query: string, limit = 20) {
      const q = normalizeText(query)
      if (!q) return []
      const digits = digitsOnly(q)
      // Mostly-numeric input is a phone number search.
      if (digits.length >= 3 && digits.length >= q.replace(/\s/g, '').length - 1) {
        return docs.filter((d) => d.phone.includes(digits)).slice(0, limit).map((d) => d.guest)
      }
      // Exact substring matches first, then fuzzy matches.
      const exact = docs.filter((d) => d.name.includes(q) || d.nickname.includes(q))
      const seen = new Set(exact.map((d) => d.guest.id))
      const fuzzy = fuse
        .search(q, { limit: limit * 2 })
        .map((r) => r.item)
        .filter((d) => !seen.has(d.guest.id))
      return [...exact, ...fuzzy].slice(0, limit).map((d) => d.guest)
    },
  }
}

export const QR_PREFIX = 'WMS-GUEST:'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function qrPayloadForGuest(g: Pick<CachedGuest, 'qr_token'>): string {
  return `${QR_PREFIX}${g.qr_token}`
}

/** Interpret a scanned code: our guest QR token, or free text to search for. */
export function parseScannedCode(text: string): { kind: 'token'; token: string } | { kind: 'text'; text: string } {
  const raw = text.trim()
  const candidate = raw.toUpperCase().startsWith(QR_PREFIX) ? raw.slice(QR_PREFIX.length) : raw
  if (UUID_RE.test(candidate)) return { kind: 'token', token: candidate.toLowerCase() }
  return { kind: 'text', text: raw }
}

/** Pick candidate name lines from OCR output (drop very short or mostly-symbol lines). */
export function ocrCandidateLines(text: string): string[] {
  return Array.from(
    new Set(
      text
        .split(/\r?\n/)
        .map((l) => l.replace(/[^\p{L}\p{N}\s.'-]/gu, ' ').replace(/\s+/g, ' ').trim())
        .filter((l) => l.replace(/[^\p{L}]/gu, '').length >= 3),
    ),
  )
}
