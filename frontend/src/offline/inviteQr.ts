/**
 * Guest QR codes that double as the invitation's only QR.
 *
 * An event can set an "invitation QR" base: a web link (e.g. Google Maps) or a Cambodian bank KHQR
 * payment string. Each guest's QR is that base with the guest's code embedded, so a guest scanning
 * it with their phone gets the map / pays the gift, while the gift desk scanner reads the code
 * locally (no network) to select the guest.
 *
 *   link:  https://maps.google.com/?q=...&WMS=<full guest token>
 *   KHQR:  the bank's string with tag 62 (additional data) / 01 (bill number) = "WMS" + 16 hex
 *          chars of the token, and the CRC recomputed. Everything else is kept as issued.
 *   none:  "WMS-GUEST:<token>" (the original format; still accepted when scanning)
 */

export const LEGACY_PREFIX = 'WMS-GUEST:'
export const URL_PARAM = 'WMS'
/** Marks our code inside a KHQR bill number; the rest is the token's first 16 hex chars. */
const KHQR_REF_PREFIX = 'WMS'
const SHORT_HEX = 16
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SHORT_RE = new RegExp(`^[0-9a-f]{${SHORT_HEX}}$`, 'i')

// --- KHQR (EMVCo merchant-presented QR) -------------------------------------------------------

interface Tlv {
  tag: string
  value: string
}

/** EMVCo lengths are counted in characters by most issuers, in UTF-8 bytes by some; support both. */
type LengthMode = 'chars' | 'bytes'

const encoder = new TextEncoder()
const byteLength = (s: string) => encoder.encode(s).length
const lengthOf = (s: string, mode: LengthMode) => (mode === 'bytes' ? byteLength(s) : [...s].length)

/** CRC-16/CCITT-FALSE over UTF-8 bytes, as EMVCo tag 63 requires; 4 uppercase hex digits. */
export function crc16(text: string): string {
  let crc = 0xffff
  for (const byte of encoder.encode(text)) {
    crc ^= byte << 8
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

/** Take `n` length units from the start of `s` (code points, or UTF-8 bytes). */
function take(s: string, n: number, mode: LengthMode): string | null {
  const chars = [...s]
  if (mode === 'chars') return n <= chars.length ? chars.slice(0, n).join('') : null
  let out = ''
  let bytes = 0
  for (const c of chars) {
    if (bytes === n) break
    bytes += byteLength(c)
    out += c
  }
  return bytes === n ? out : null
}

function parseTlv(s: string, mode: LengthMode): Tlv[] | null {
  const out: Tlv[] = []
  let rest = s
  while (rest.length) {
    if (!/^\d{4}/.test(rest)) return null
    const tag = rest.slice(0, 2)
    const len = Number(rest.slice(2, 4))
    const value = take(rest.slice(4), len, mode)
    if (value === null) return null
    out.push({ tag, value })
    rest = rest.slice(4 + value.length)
  }
  return out
}

function encodeTlv(items: Tlv[], mode: LengthMode): string {
  return items
    .map(({ tag, value }) => {
      const len = lengthOf(value, mode)
      if (len > 99) throw new Error('KHQR field too long')
      return tag + String(len).padStart(2, '0') + value
    })
    .join('')
}

export interface Khqr {
  /** Top-level fields, without the trailing CRC (tag 63). */
  fields: Tlv[]
  mode: LengthMode
  merchantName: string
}

/** Parse and verify a KHQR string. Null if it isn't one or its checksum doesn't match. */
export function parseKhqr(text: string): Khqr | null {
  const s = text.trim()
  if (!s.startsWith('000201') || !/6304[0-9A-Fa-f]{4}$/.test(s)) return null
  if (crc16(s.slice(0, -4)) !== s.slice(-4).toUpperCase()) return null
  for (const mode of ['chars', 'bytes'] as const) {
    const fields = parseTlv(s, mode)
    if (fields && fields.at(-1)?.tag === '63') {
      return { fields: fields.slice(0, -1), mode, merchantName: fields.find((f) => f.tag === '59')?.value ?? '' }
    }
  }
  return null
}

function withCrc(body: string): string {
  const payload = body + '6304'
  return payload + crc16(payload)
}

/** Set tag 62 / sub-tag 01 (bill number) to `ref`, keeping other additional-data sub-tags. */
function khqrWithReference(qr: Khqr, ref: string): string {
  const fields = qr.fields.map((f) => ({ ...f }))
  const existing = fields.find((f) => f.tag === '62')
  const sub = (existing && parseTlv(existing.value, qr.mode)) || []
  const others = sub.filter((f) => f.tag !== '01')
  const additional = encodeTlv([{ tag: '01', value: ref }, ...others], qr.mode)
  if (existing) existing.value = additional
  else {
    // Insert in tag order (e.g. before a 64 language template) without reordering the issuer's fields.
    const at = fields.findIndex((f) => f.tag > '62')
    fields.splice(at < 0 ? fields.length : at, 0, { tag: '62', value: additional })
  }
  return withCrc(encodeTlv(fields, qr.mode))
}

// --- Invitation base ---------------------------------------------------------------------------

export type InviteBase =
  | { kind: 'none' }
  | { kind: 'url'; url: URL }
  | { kind: 'khqr'; qr: Khqr }
  | { kind: 'invalid'; reason: 'not-link' | 'bad-khqr' }

/** Classify what the event owner pasted. */
export function classifyInviteBase(text: string | null | undefined): InviteBase {
  const s = (text ?? '').trim()
  if (!s) return { kind: 'none' }
  if (s.startsWith('000201')) {
    const qr = parseKhqr(s)
    return qr ? { kind: 'khqr', qr } : { kind: 'invalid', reason: 'bad-khqr' }
  }
  try {
    const url = new URL(s)
    if (url.protocol === 'https:' || url.protocol === 'http:') return { kind: 'url', url }
  } catch {
    /* not a URL */
  }
  return { kind: 'invalid', reason: 'not-link' }
}

const shortCode = (token: string) => token.replace(/-/g, '').slice(0, SHORT_HEX).toLowerCase()

/** The QR content for one guest, given the event's invitation base (falls back to the original format). */
export function guestQrPayload(token: string, base?: string | null): string {
  const kind = classifyInviteBase(base)
  if (kind.kind === 'url') {
    const url = new URL(kind.url.href)
    url.searchParams.set(URL_PARAM, token)
    return url.href
  }
  if (kind.kind === 'khqr') return khqrWithReference(kind.qr, KHQR_REF_PREFIX + shortCode(token))
  return LEGACY_PREFIX + token
}

/** What a scanned code points to: a full guest token, or the short prefix carried in a KHQR. */
export type GuestRef = { kind: 'token'; token: string } | { kind: 'prefix'; prefix: string }

/** Read our guest reference out of any supported QR format, without using the network. */
export function readGuestRef(text: string): GuestRef | null {
  const raw = text.trim()
  const asToken = (t: string | null | undefined): GuestRef | null =>
    t && UUID_RE.test(t.trim()) ? { kind: 'token', token: t.trim().toLowerCase() } : null

  if (raw.toUpperCase().startsWith(LEGACY_PREFIX)) return asToken(raw.slice(LEGACY_PREFIX.length))
  if (UUID_RE.test(raw)) return asToken(raw)

  if (raw.startsWith('000201')) {
    const qr = parseKhqr(raw)
    const additional = qr?.fields.find((f) => f.tag === '62')
    const bill = additional && parseTlv(additional.value, qr!.mode)?.find((f) => f.tag === '01')?.value
    if (bill?.toUpperCase().startsWith(KHQR_REF_PREFIX)) {
      const code = bill.slice(KHQR_REF_PREFIX.length)
      if (SHORT_RE.test(code)) return { kind: 'prefix', prefix: code.toLowerCase() }
    }
    return null
  }

  try {
    const url = new URL(raw)
    for (const [key, value] of url.searchParams) if (key.toUpperCase() === URL_PARAM) return asToken(value)
  } catch {
    /* not a URL */
  }
  return null
}

/** Dashed UUID prefix for a short code, for a range lookup on stored tokens ("0123abcd-4567-89ab"). */
export function tokenPrefixFromShort(prefix: string): string {
  const p = prefix.toLowerCase()
  return `${p.slice(0, 8)}-${p.slice(8, 12)}-${p.slice(12, 16)}`
}
