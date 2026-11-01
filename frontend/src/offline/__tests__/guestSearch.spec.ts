import { describe, expect, it } from 'vitest'
import type { CachedGuest } from '@/offline/db'
import { createGuestSearcher, ocrCandidateLines, parseScannedCode, qrPayloadForGuest } from '@/offline/guestSearch'

const g = (id: number, full_name: string, extra: Partial<CachedGuest> = {}): CachedGuest => ({
  eventId: 1,
  id,
  full_name,
  nickname: '',
  phone: '',
  side: 'both',
  group: '',
  table_no: '',
  qr_token: `00000000-0000-4000-8000-00000000000${id}`,
  updated_at: '',
  ...extra,
})

const guests = [
  g(1, 'Sokha Chan', { nickname: 'Kha', phone: '012 345 678' }),
  g(2, 'Maria García'),
  g(3, 'Nguyễn Văn An'),
  g(4, 'John Smith', { nickname: 'Johnny' }),
]
const searcher = createGuestSearcher(guests)
const names = (q: string) => searcher.search(q).map((x) => x.full_name)

describe('smart guest search', () => {
  it('matches ignoring case and accents', () => {
    expect(names('garcia')[0]).toBe('Maria García')
    expect(names('nguyen')[0]).toBe('Nguyễn Văn An')
  })
  it('tolerates typos and matches nicknames', () => {
    expect(names('sokah')[0]).toBe('Sokha Chan')
    expect(names('johnny')[0]).toBe('John Smith')
  })
  it('searches phone numbers by digits', () => {
    expect(names('345678')).toEqual(['Sokha Chan'])
    expect(names('012-345')).toEqual(['Sokha Chan'])
  })
  it('returns nothing for an empty query', () => {
    expect(names('  ')).toEqual([])
  })
})

describe('scanning helpers', () => {
  it('parses our QR payload, bare tokens and free text', () => {
    const token = guests[0].qr_token
    expect(parseScannedCode(qrPayloadForGuest(guests[0]))).toEqual({ kind: 'token', token })
    expect(parseScannedCode(token.toUpperCase())).toEqual({ kind: 'token', token })
    expect(parseScannedCode('Sokha Chan')).toEqual({ kind: 'text', text: 'Sokha Chan' })
  })
  it('extracts readable lines from OCR output', () => {
    expect(ocrCandidateLines('Mr. & Mrs.\n|| ~~\nSokha Chan\n\nSokha Chan\n12')).toEqual(['Mr. Mrs.', 'Sokha Chan'])
  })
})
