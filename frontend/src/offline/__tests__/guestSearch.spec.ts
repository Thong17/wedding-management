import { describe, expect, it } from 'vitest'
import type { CachedGuest } from '@/offline/db'
import { createGuestSearcher, fixKhmerVowelOrder, guestsLikeOcrLines, ocrCandidateLines, parseScannedCode, pickMiddleText, qrPayloadForGuest, stripTitles } from '@/offline/guestSearch'

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

describe('matching scanned names to the guest list', () => {
  const list = createGuestSearcher([
    g(1, 'Bunthong', { nickname: 'Thong' }),
    g(2, 'Buntheng'),
    g(3, 'សុខា ចាន់'),
    g(4, 'Sokha Chan'),
  ])

  it('offers similar guests for a misread name, closest first', () => {
    const found = guestsLikeOcrLines(['Lunthong'], list).map((x) => x.full_name)
    expect(found[0]).toBe('Bunthong')
    expect(found).not.toContain('Sokha Chan')
  })

  it('lists each guest once, the best line first, up to the limit', () => {
    const found = guestsLikeOcrLines(['លោក សុខា ចាន់', 'Sokha Chan', 'Bunthong'], list, 2).map((x) => x.full_name)
    expect(found).toEqual(['សុខា ចាន់', 'Sokha Chan'])
  })

  it('knows when the text is exactly a guest on the list', () => {
    expect(list.findExact('BUNTHONG')?.id).toBe(1)
    expect(list.findExact('លោក សុខា ចាន់')?.id).toBe(3) // title ignored
    expect(list.findExact('thong')?.id).toBe(1) // nickname
    expect(list.findExact('Lunthong')).toBeUndefined()
    expect(list.findExact('  ')).toBeUndefined()
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

describe('Khmer names', () => {
  const khmer = createGuestSearcher([
    g(11, 'សុខា ចាន់'),
    g(12, 'ស្រីមុំ ហេង'),
    g(13, 'វណ្ណៈ សុខ', { nickname: 'ណា' }),
  ])
  const found = (q: string) => khmer.search(q).map((x) => x.full_name)

  it('keeps vowel signs and the coeng intact in OCR lines', () => {
    // Combining marks used to be stripped: "សុខា ចាន់" became "ស ខ ច ន".
    expect(ocrCandidateLines('សុខា ចាន់\n~~\nស្រីមុំ')).toEqual(['សុខា ចាន់', 'ស្រីមុំ'])
  })

  it('drops zero-width characters that OCR and copy-paste leave inside Khmer', () => {
    expect(ocrCandidateLines('សុ​ខា‌ ចាន់')).toEqual(['សុខា ចាន់'])
    expect(found('សុ​ខា')[0]).toBe('សុខា ចាន់')
  })

  it('offers each person of a couple separately', () => {
    expect(ocrCandidateLines('លោក សុខា ចាន់ និង លោកស្រី ស្រីមុំ ហេង')).toEqual([
      'លោក សុខា ចាន់ និង លោកស្រី ស្រីមុំ ហេង',
      'លោក សុខា ចាន់',
      'លោកស្រី ស្រីមុំ ហេង',
    ])
  })

  it('ignores titles when searching, Khmer and English', () => {
    expect(found('លោក សុខា ចាន់')[0]).toBe('សុខា ចាន់')
    expect(found('លោកស្រី ស្រីមុំ')[0]).toBe('ស្រីមុំ ហេង') // longest title wins over លោក
    expect(found('ឯកឧត្តម វណ្ណៈ')[0]).toBe('វណ្ណៈ សុខ')
    expect(found('លោកសុខា')[0]).toBe('សុខា ចាន់') // title written straight onto the name
    expect(names('Mr. Sokha')[0]).toBe('Sokha Chan')
    expect(stripTitles('mrsmith')).toBe('mrsmith') // Latin titles only as whole words
    expect(stripTitles('mr. smith')).toBe('smith')
  })

  describe('reading only the text in the middle', () => {
    const GOLD: [number, number, number] = [200, 160, 60]
    const BLACK: [number, number, number] = [20, 20, 20]
    const line = (text: string, x0: number, y0: number, x1: number, y1: number, color = GOLD, confidence = 90) => ({
      text, confidence, color, bbox: { x0, y0, x1, y1 },
    })
    // A 1000×1000 invitation: greeting at the top, the name across the middle, venue and date below.
    const card = [
      line('សូមគោរពអញ្ជើញ', 300, 80, 700, 130),
      line('លោក សុខា ចាន់', 250, 470, 750, 540),
      line('ថ្ងៃសៅរ៍ ទី១២ ខែធ្នូ', 320, 840, 680, 880),
    ]

    it('takes only the line at the centre', () => {
      expect(pickMiddleText(card, 1000, 1000).lines).toEqual(['លោក សុខា ចាន់'])
    })

    it('keeps a name wrapped onto the next line in the same size and colour', () => {
      const wrapped = [...card, line('និង លោកស្រី ស្រីមុំ ហេង', 220, 560, 780, 628)]
      expect(pickMiddleText(wrapped, 1000, 1000).lines).toEqual(['លោក សុខា ចាន់', 'និង លោកស្រី ស្រីមុំ ហេង', 'លោកស្រី ស្រីមុំ ហេង'])
    })

    it('ignores nearby text in another size, colour, or further away', () => {
      const busy = [
        ...card,
        line('ជូនចំពោះ', 400, 420, 600, 450), // small label just above
        line('សិរីមង្គល', 300, 560, 700, 630, BLACK), // same size, different ink
        line('ភោជនីយដ្ឋាន', 300, 700, 700, 770), // same style, but a gap of two lines
        line('ឃឃឃឃ', 300, 545, 700, 610, GOLD, 12), // a smudge the engine isn't sure of
      ]
      expect(pickMiddleText(busy, 1000, 1000).lines).toEqual(['លោក សុខា ចាន់'])
    })

    it('keeps only the words around the centre when the row holds more than the name', () => {
      // One OCR line across the whole row: a black label, the gold name, then a far-off table number.
      const word = (text: string, x0: number, x1: number, color = GOLD) => ({ text, color, bbox: { x0, y0: 470, x1, y1: 540 } })
      const row = {
        ...line('ឈ្មោះ សុខា ចាន់ តុលេខ៥', 100, 470, 920, 540),
        words: [word('ឈ្មោះ', 100, 260, BLACK), word('សុខា', 400, 500), word('ចាន់', 530, 640), word('តុលេខ៥', 800, 920)],
      }
      expect(pickMiddleText([row], 1000, 1000).lines).toEqual(['សុខា ចាន់'])
    })

    it('only adds a line below when it is centred under the name', () => {
      const leftAligned = [...card, line('ស្រីមុំ ហេង', 0, 560, 320, 628)]
      expect(pickMiddleText(leftAligned, 1000, 1000).lines).toEqual(['លោក សុខា ចាន់'])
    })

    it('still reads a blurry photo the engine is unsure of', () => {
      // Real photos of Khmer often read at low confidence: never come back empty because of it.
      expect(pickMiddleText([line('សុខា ចាន់', 250, 470, 750, 540, GOLD, 10)], 1000, 1000).lines).toEqual(['សុខា ចាន់'])
    })

    it('keeps the whole row when the word at the centre is only a scrap', () => {
      const word = (text: string, x0: number, x1: number) => ({ text, color: GOLD, bbox: { x0, y0: 470, x1, y1: 540 } })
      const row = {
        ...line('សុខា + ចាន់', 200, 470, 800, 540),
        words: [word('សុខា', 200, 400), word('+', 490, 510), word('ចាន់', 650, 800)],
      }
      expect(pickMiddleText([row], 1000, 1000).lines).toEqual(['សុខា ចាន់'])
    })

    it('uses the nearest line when none covers the centre', () => {
      const off = [line('Sokha Chan', 0, 0, 200, 40), line('Phnom Penh', 700, 900, 990, 940)]
      expect(pickMiddleText(off, 1000, 1000).lines).toEqual(['Phnom Penh'])
      expect(pickMiddleText([], 1000, 1000).lines).toEqual([])
    })

    it('never takes a printed label for the name', () => {
      // A real card: printed "ជូនចំពោះ៖" then a handwritten name in blue pen.
      const BLUE: [number, number, number] = [40, 40, 110]
      const word = (text: string, x0: number, x1: number, color: [number, number, number], confidence: number) => ({
        text, color, confidence, bbox: { x0, y0: 160, x1, y1: 390 },
      })
      const row = {
        ...line('ជូនចំពោះ៖ Bunthong', 548, 160, 1505, 390),
        words: [word('ជូនចំពោះ៖', 548, 855, BLACK, 91), word('Bunthong', 967, 1505, BLUE, 57)],
      }
      expect(pickMiddleText([row], 2560, 462)).toEqual({ lines: ['Bunthong'], confidence: 57 })
      // The label alone is not a name: nothing to offer, so the scanner tries again.
      expect(pickMiddleText([line('ជូនចំពោះ', 300, 400, 700, 600)], 1000, 1000).lines).toEqual([])
      expect(ocrCandidateLines('ជូនចំពោះ សុខា ចាន់\nName: John Smith\nTony Lee')).toEqual(['សុខា ចាន់', 'John Smith', 'Tony Lee'])
    })
  })

  it('fixes vowels OCR writes before their consonant', () => {
    expect(fixKhmerVowelOrder('េលាក សុខា')).toBe('លោក សុខា')
    expect(fixKhmerVowelOrder('ែកវ')).toBe('កែវ')
    expect(fixKhmerVowelOrder('កេរ្តិ៍ ស្រីពៅ')).toBe('កេរ្តិ៍ ស្រីពៅ') // correctly typed text is untouched
    expect(ocrCandidateLines('េលាក សុខា ចាន់')).toEqual(['លោក សុខា ចាន់'])
    expect(found('េលាក សុខា ចាន់')[0]).toBe('សុខា ចាន់')
  })

  it('finds names despite a small OCR mistake', () => {
    expect(found('សុខា ចន់')[0]).toBe('សុខា ចាន់') // missing ា
    // A handwritten "Bunthong" read from a real card photo.
    expect(createGuestSearcher([g(21, 'Bunthong'), g(22, 'Sokha Chan')]).search('Lunthong')[0]?.full_name).toBe('Bunthong')
  })
})
