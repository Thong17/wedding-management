import Fuse from 'fuse.js'
import type { CachedGuest } from './db'
import { guestQrPayload, readGuestRef, type GuestRef } from './inviteQr'

/** Invisible characters that OCR and copy-paste often leave inside (especially Khmer) text. */
const ZERO_WIDTH = /[​-‍⁠﻿]/g

/**
 * OCR writes the vowels drawn before a consonant (េ ែ ៃ) in visual order: "លោក" comes out as
 * "េលាក". Typed Khmer never starts a word with a vowel sign, so move such a vowel back after its
 * consonant (and subscripts), then join េ + ា into ោ and េ + ៅ into ៅ.
 */
export function fixKhmerVowelOrder(s: string): string {
  return s
    .replace(/(?<![ក-៓])([េែៃ])([ក-អ](?:្[ក-អ])*)/g, '$2$1')
    .replace(/េា/g, 'ោ')
    .replace(/េៅ/g, 'ៅ')
}

/**
 * Lowercase and strip Latin accents so "Garcia" finds "García" and "nguyen" finds "Nguyễn".
 * Only the Latin combining range is removed: Khmer vowel signs are marks too and must stay.
 */
export function normalizeText(s: string): string {
  return fixKhmerVowelOrder(s.replace(ZERO_WIDTH, ''))
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .normalize('NFC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Titles that come before names on invitations and in guest lists, longest first so "លោកស្រី" wins
 * over "លោក". Both the usual spellings of ឯកឧត្តម / សម្តេច are listed (ត vs ដ subscripts).
 */
const TITLES = [
  'ឯកឧត្តម', 'ឯកឧត្ដម', 'លោកជំទាវ', 'អ្នកឧកញ៉ា', 'វេជ្ជបណ្ឌិត', 'សម្តេច', 'សម្ដេច', 'លោកស្រី', 'លោកគ្រូ',
  'អ្នកគ្រូ', 'អ្នកស្រី', 'អ្នកនាង', 'បណ្ឌិត', 'ឧកញ៉ា', 'កញ្ញា', 'លោក',
  'mrs.', 'mrs', 'mr.', 'mr', 'ms.', 'ms', 'miss', 'dr.', 'dr', 'h.e.',
].map(normalizeText)

/** Remove leading titles ("លោក សុខា ចាន់" → "សុខា ចាន់", "ឯកឧត្តម បណ្ឌិត X" → "X"). Expects normalized text. */
export function stripTitles(q: string): string {
  let s = q
  for (let again = true; again; ) {
    again = false
    for (const title of TITLES) {
      // A Latin title must be a whole word; a Khmer one may be written straight onto the name.
      const isLatin = /^[a-z.]+$/.test(title)
      if (s.startsWith(title) && (s.length === title.length || s[title.length] === ' ' || !isLatin)) {
        const rest = s.slice(title.length).trim()
        if (letterCount(rest) >= 2) {
          s = rest
          again = true
          break
        }
      }
    }
  }
  return s
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
  /** The guest whose name or nickname is exactly this (ignoring case, accents and titles). */
  findExact(query: string): CachedGuest | undefined
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
    findExact(query: string) {
      const q = stripTitles(normalizeText(query))
      return q ? docs.find((d) => d.name === q || d.nickname === q)?.guest : undefined
    },
    search(query: string, limit = 20) {
      // Titles aren't part of the stored name: "លោក សុខា" should find "សុខា ចាន់".
      const q = stripTitles(normalizeText(query))
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

export interface GuestFilter {
  /** 'all', or a side: 'bride' / 'groom' also include guests of both sides. */
  side: 'all' | CachedGuest['side']
  /** 'all', or a group (family, neighbour…) compared ignoring case and spacing. */
  group: string
}

export const NO_FILTER: GuestFilter = { side: 'all', group: 'all' }

const groupKey = (s: string) => normalizeText(s)

/** Keep the guests that match the filter (order kept). */
export function filterGuests(guests: CachedGuest[], filter: GuestFilter): CachedGuest[] {
  const group = filter.group === 'all' ? null : groupKey(filter.group)
  return guests.filter(
    (g) =>
      (filter.side === 'all' || g.side === filter.side || (g.side === 'both' && filter.side !== 'both')) &&
      (group === null || groupKey(g.group) === group),
  )
}

/** The groups used on the guest list, each once (as first written), in name order. */
export function guestGroups(guests: CachedGuest[]): string[] {
  const seen = new Map<string, string>()
  for (const g of guests) {
    const name = g.group.trim()
    if (name && !seen.has(groupKey(name))) seen.set(groupKey(name), name)
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b))
}

/**
 * Guests on the list whose names are like the text read from a card, best first: OCR misreads
 * letters ("Bunthong" comes out as "Lunthong"), so offer the closest guests to pick from. The best
 * line's matches come first, then the next line's.
 */
export function guestsLikeOcrLines(lines: string[], searcher: GuestSearcher, limit = 5): CachedGuest[] {
  const out = new Map<number, CachedGuest>()
  for (const line of lines) {
    for (const g of searcher.search(line, limit)) if (out.size < limit) out.set(g.id, g)
  }
  return [...out.values()]
}

/** A guest's QR content, embedded in the event's invitation link or bank QR when it has one. */
export function qrPayloadForGuest(g: Pick<CachedGuest, 'qr_token'>, inviteBase?: string | null): string {
  return guestQrPayload(g.qr_token, inviteBase)
}

/**
 * Interpret a scanned code: one of our guest QR formats, some other link / bank QR (not a guest),
 * or free text (e.g. a barcode with a name) to search for.
 */
export function parseScannedCode(text: string): GuestRef | { kind: 'other' } | { kind: 'text'; text: string } {
  const ref = readGuestRef(text)
  if (ref) return ref
  const raw = text.trim()
  if (raw.startsWith('000201') || /^https?:\/\//i.test(raw)) return { kind: 'other' }
  return { kind: 'text', text: raw }
}

const letterCount = (s: string) => s.replace(/[^\p{L}]/gu, '').length

/**
 * Words printed on a card before the space where the name is written ("ជូនចំពោះ: ________").
 * They are never the guest's name. Longest first; Latin ones only as whole words.
 */
const LABELS = [
  'សូមគោរពអញ្ជើញ', 'គោរពជូន', 'ជូនចំពោះ', 'ឈ្មោះ', 'ជូន', 'name', 'dear', 'to',
]

/** Tidy one line of OCR text: fix Khmer vowel order, drop invisible characters and stray symbols. */
const clean = (s: string) =>
  fixKhmerVowelOrder(s.normalize('NFC').replace(ZERO_WIDTH, ''))
    .replace(/[^\p{L}\p{M}\p{N}\s.'-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** Drop a label at the start of a cleaned OCR line: "ជូនចំពោះ Bunthong" → "Bunthong". */
function stripLabel(line: string): string {
  const lower = line.toLowerCase()
  for (const label of LABELS) {
    const isLatin = /^[a-z]+$/.test(label)
    if (lower.startsWith(label) && (!isLatin || lower.length === label.length || lower[label.length] === ' ')) {
      return line.slice(label.length).trim()
    }
  }
  return line
}

/**
 * Pick candidate name lines from OCR output (drop very short or mostly-symbol lines, and labels
 * like "ជូនចំពោះ").
 * Keeps combining marks (\p{M}): Khmer vowel signs and the coeng ្ are marks, and dropping them turned
 * "សុខា ចាន់" into "ស ខ ច ន". A couple written together ("X និង Y", "X & Y", "X and Y") is also
 * offered as each person separately.
 */
export function ocrCandidateLines(text: string): string[] {
  const out = new Set<string>()
  for (const raw of text.split(/\r?\n/)) {
    const line = stripLabel(clean(raw))
    if (letterCount(line) < 3) continue
    out.add(line)
    // "និង" may also start a line: a couple's name wrapped onto two lines.
    const people = raw.split(/(?:^|\s+)និង\s+|\s*&\s*|\s+and\s+/i).map((p) => stripLabel(clean(p)))
    if (people.length > 1) {
      for (const p of people) if (letterCount(p) >= 3 && !TITLES.includes(normalizeText(p))) out.add(p)
    }
  }
  return [...out]
}

type Box = { x0: number; y0: number; x1: number; y1: number }
type Rgb = [number, number, number]

/** One word of OCR output with its position in the image. */
export interface OcrWord {
  text: string
  bbox: Box
  /** How sure the engine is of the text, 0–100. */
  confidence?: number
  /** Ink colour of the text (RGB), when known. */
  color?: Rgb | null
}

/** One line of OCR output with its position in the image (tesseract's `data.lines`). */
export interface OcrLine extends OcrWord {
  confidence: number
  words?: OcrWord[]
}

export interface MiddleText {
  lines: string[]
  confidence: number
}

/**
 * Lines the engine was less sure of than this (0–100) are usually noise. Kept low: Khmer in real
 * photos often reads at 20–50, and when nothing reaches it every line is used instead.
 */
const MIN_CONFIDENCE = 15
/** Same text style: line heights within this ratio of each other… */
const MAX_SIZE_RATIO = 1.35
/** …(single Khmer words vary more: marks above and below make some taller)… */
const MAX_WORD_SIZE_RATIO = 1.6
/** …ink colours closer than this (distance in RGB)… */
const MAX_COLOR_DISTANCE = 70
/** …no more than this many line-heights of empty space between lines, or between words… */
const MAX_LINE_GAP = 0.9
const MAX_WORD_GAP = 1
/** …and a wrapped line must be centred under the name (offset at most this share of its width). */
const MAX_CENTRE_OFFSET = 0.25

const boxHeight = (b: Box) => Math.max(1, b.y1 - b.y0)
const boxCentreX = (b: Box) => (b.x0 + b.x1) / 2
const similarSize = (a: Box, b: Box, maxRatio: number) => {
  const ratio = boxHeight(a) / boxHeight(b)
  return ratio <= maxRatio && ratio >= 1 / maxRatio
}
const similarColor = (a?: Rgb | null, b?: Rgb | null) =>
  !a || !b || Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) <= MAX_COLOR_DISTANCE

/**
 * OCR returns a whole row as one line, which may hold more than the name ("ឈ្មោះ៖ សុខា ចាន់ … តុ ៥").
 * Keep only the run of words around `x` (the word nearest it, then neighbours to the left and right
 * in the same size and colour with normal word spacing); a wide gap or a change of style ends it.
 * Labels ("ជូនចំពោះ") are skipped. The line's confidence becomes that of the words kept.
 */
function trimRow(line: OcrLine, x: number): OcrLine {
  const words = (line.words ?? [])
    .filter((w) => stripLabel(clean(w.text)))
    .sort((a, b) => a.bbox.x0 - b.bbox.x0)
  if (!words.length) return line
  const away = (w: OcrWord) => Math.max(w.bbox.x0 - x, 0, x - w.bbox.x1)
  const seed = words.reduce((best, w) => (away(w) < away(best) ? w : best))
  const fits = (w: OcrWord, neighbour: OcrWord) =>
    Math.max(w.bbox.x0 - neighbour.bbox.x1, neighbour.bbox.x0 - w.bbox.x1) <= MAX_WORD_GAP * boxHeight(line.bbox) &&
    similarSize(w.bbox, seed.bbox, MAX_WORD_SIZE_RATIO) &&
    similarColor(w.color, seed.color)
  let lo = words.indexOf(seed)
  let hi = lo
  while (lo > 0 && fits(words[lo - 1], words[lo])) lo--
  while (hi < words.length - 1 && fits(words[hi + 1], words[hi])) hi++
  const kept = words.slice(lo, hi + 1)
  const scores = kept.flatMap((w) => (w.confidence === undefined ? [] : [w.confidence]))
  return {
    ...line,
    text: kept.map((w) => w.text.trim()).join(' '),
    confidence: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : line.confidence,
    bbox: {
      x0: Math.min(...kept.map((w) => w.bbox.x0)),
      y0: line.bbox.y0,
      x1: Math.max(...kept.map((w) => w.bbox.x1)),
      y1: line.bbox.y1,
    },
    color: seed.color ?? line.color,
  }
}

/**
 * Read only the text in the middle of the image, measured both across and down: take the line at
 * the exact centre point (or the one nearest to it) and, within that row, only the words around the
 * centre. Then add the lines right above/below that look like the same text: similar size, same ink
 * colour, close spacing and centred under it (a name wrapped onto two lines). Everything else on the
 * card (greeting, labels, venue, date, decoration) is ignored. Lines come top to bottom; a couple is
 * also offered as each person. `confidence` (0–100) is how sure the engine was of the middle text.
 */
export function pickMiddleText(lines: OcrLine[], width: number, height: number): MiddleText {
  const readable = lines.filter((l) => ocrCandidateLines(l.text).length)
  const confident = readable.filter((l) => l.confidence >= MIN_CONFIDENCE)
  const usable = confident.length ? confident : readable
  if (!usable.length) return { lines: [], confidence: 0 }
  const cx = width / 2
  const cy = height / 2
  // Distance from the centre point to the line's box (0 when the box covers the centre).
  const distance = ({ bbox: b }: OcrLine) =>
    Math.hypot(Math.max(b.x0 - cx, 0, cx - b.x1), Math.max(b.y0 - cy, 0, cy - b.y1))
  const nearest = usable.reduce((best, l) =>
    distance(l) < distance(best) || (distance(l) === distance(best) && boxHeight(l.bbox) > boxHeight(best.bbox)) ? l : best,
  )
  // If trimming leaves only a scrap (e.g. a symbol at the centre), keep the whole row.
  const trimmed = trimRow(nearest, cx)
  const anchor = ocrCandidateLines(trimmed.text).length ? trimmed : nearest
  // Other rows are trimmed around the name's centre, so a wrapped line keeps only what sits under it.
  const rows = usable.filter((l) => l !== nearest).map((l) => trimRow(l, boxCentreX(anchor.bbox)))

  const belongs = (l: OcrLine, to: OcrLine) => {
    const gap = Math.max(l.bbox.y0 - to.bbox.y1, to.bbox.y0 - l.bbox.y1, 0)
    const offset = Math.abs(boxCentreX(l.bbox) - boxCentreX(anchor.bbox))
    const span = Math.max(l.bbox.x1 - l.bbox.x0, anchor.bbox.x1 - anchor.bbox.x0)
    return (
      gap <= MAX_LINE_GAP * boxHeight(anchor.bbox) &&
      offset <= MAX_CENTRE_OFFSET * span &&
      similarSize(l.bbox, anchor.bbox, MAX_SIZE_RATIO) &&
      similarColor(l.color, anchor.color)
    )
  }

  const group = [anchor]
  for (let grew = true; grew; ) {
    grew = false
    for (const l of rows) {
      if (group.includes(l) || !group.some((g) => belongs(l, g))) continue
      group.push(l)
      grew = true
    }
  }
  group.sort((a, b) => a.bbox.y0 - b.bbox.y0)
  return { lines: [...new Set(group.flatMap((l) => ocrCandidateLines(l.text)))], confidence: anchor.confidence }
}
