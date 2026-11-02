import { describe, expect, it } from 'vitest'
import { classifyInviteBase, crc16, guestQrPayload, parseKhqr, readGuestRef } from '@/offline/inviteQr'
import { parseScannedCode } from '@/offline/guestSearch'

const TOKEN = '0f8fad5b-d9cb-469f-a165-70867728950e'
const SHORT = '0f8fad5bd9cb469f'

/** Build a KHQR-style string the way issuers do: TLV fields, then tag 63 with the CRC. */
function tlv(fields: [string, string][], mode: 'chars' | 'bytes' = 'chars'): string {
  const len = (v: string) => (mode === 'bytes' ? new TextEncoder().encode(v).length : [...v].length)
  return fields.map(([tag, v]) => tag + String(len(v)).padStart(2, '0') + v).join('')
}
function khqr(fields: [string, string][], mode: 'chars' | 'bytes' = 'chars'): string {
  const body = tlv(fields, mode) + '6304'
  return body + crc16(body)
}

const merchant: [string, string][] = [
  ['00', '01'],
  ['01', '11'],
  ['29', tlv([['00', 'sokha_chan@aclb']])],
  ['52', '5999'],
  ['53', '840'],
  ['58', 'KH'],
  ['59', 'SOKHA CHAN'],
  ['60', 'Phnom Penh'],
]
const BANK_QR = khqr(merchant)

describe('crc16', () => {
  it('is CRC-16/CCITT-FALSE', () => expect(crc16('123456789')).toBe('29B1'))
})

describe('web link invitations', () => {
  it('adds WMS=<token> and keeps the existing query and fragment', () => {
    const qr = guestQrPayload(TOKEN, 'https://www.google.com/maps/search/?api=1&query=11.55,104.92#top')
    const url = new URL(qr)
    expect(url.searchParams.get('query')).toBe('11.55,104.92')
    expect(url.searchParams.get('WMS')).toBe(TOKEN)
    expect(url.hash).toBe('#top')
    expect(readGuestRef(qr)).toEqual({ kind: 'token', token: TOKEN })
  })

  it('reads the parameter case-insensitively', () => {
    expect(readGuestRef(`https://maps.app.goo.gl/abc?wms=${TOKEN.toUpperCase()}`)).toEqual({ kind: 'token', token: TOKEN })
  })
})

describe('bank KHQR invitations', () => {
  it('accepts a valid bank QR and rejects a tampered one', () => {
    expect(classifyInviteBase(BANK_QR)).toMatchObject({ kind: 'khqr', qr: { merchantName: 'SOKHA CHAN' } })
    const tampered = BANK_QR.replace('SOKHA CHAN', 'SOKHA CHAM')
    expect(classifyInviteBase(tampered)).toEqual({ kind: 'invalid', reason: 'bad-khqr' })
  })

  it('embeds the short code as the bill number, keeps every other field, and stays valid', () => {
    const qr = guestQrPayload(TOKEN, BANK_QR)
    const parsed = parseKhqr(qr)
    expect(parsed).not.toBeNull() // checksum recomputed correctly
    const byTag = Object.fromEntries(parsed!.fields.map((f) => [f.tag, f.value]))
    expect(byTag['62']).toBe(tlv([['01', `WMS${SHORT}`]]))
    // Issuer's fields untouched and in their original order, with 62 placed in tag order.
    expect(parsed!.fields.map((f) => f.tag)).toEqual(['00', '01', '29', '52', '53', '58', '59', '60', '62'])
    for (const [tag, value] of merchant) expect(byTag[tag]).toBe(value)
    expect(readGuestRef(qr)).toEqual({ kind: 'prefix', prefix: SHORT })
  })

  it('replaces only its own sub-field in an existing additional-data field', () => {
    const base = khqr([...merchant, ['62', tlv([['01', 'OLD-BILL'], ['07', 'TERM1']])]])
    const fields = parseKhqr(guestQrPayload(TOKEN, base))!.fields
    expect(fields.find((f) => f.tag === '62')?.value).toBe(tlv([['01', `WMS${SHORT}`], ['07', 'TERM1']]))
  })

  it('inserts additional data before a later language template', () => {
    const base = khqr([...merchant, ['64', tlv([['00', 'km'], ['01', 'សុខា ចាន់']])]])
    const tags = parseKhqr(guestQrPayload(TOKEN, base))!.fields.map((f) => f.tag)
    expect(tags.slice(-2)).toEqual(['62', '64'])
  })

  it('handles issuers that count Khmer text lengths in UTF-8 bytes', () => {
    const base = khqr([...merchant, ['64', tlv([['00', 'km'], ['01', 'សុខា ចាន់']], 'bytes')]], 'bytes')
    const parsed = parseKhqr(guestQrPayload(TOKEN, base))
    expect(parsed?.mode).toBe('bytes')
    expect(readGuestRef(guestQrPayload(TOKEN, base))).toEqual({ kind: 'prefix', prefix: SHORT })
  })
})

describe('scanning', () => {
  it('still reads the original format and bare tokens', () => {
    expect(parseScannedCode(`WMS-GUEST:${TOKEN}`)).toEqual({ kind: 'token', token: TOKEN })
    expect(parseScannedCode(guestQrPayload(TOKEN))).toEqual({ kind: 'token', token: TOKEN })
    expect(parseScannedCode(TOKEN.toUpperCase())).toEqual({ kind: 'token', token: TOKEN })
  })

  it("treats someone else's link or bank QR as not a guest, and other text as a search", () => {
    expect(parseScannedCode('https://maps.google.com/?q=hall')).toEqual({ kind: 'other' })
    expect(parseScannedCode(BANK_QR)).toEqual({ kind: 'other' })
    expect(parseScannedCode('Sokha Chan')).toEqual({ kind: 'text', text: 'Sokha Chan' })
  })

  it('classifies what the owner pasted', () => {
    expect(classifyInviteBase('')).toEqual({ kind: 'none' })
    expect(classifyInviteBase('ftp://x').kind).toBe('invalid')
    expect(classifyInviteBase('just text')).toEqual({ kind: 'invalid', reason: 'not-link' })
  })
})
