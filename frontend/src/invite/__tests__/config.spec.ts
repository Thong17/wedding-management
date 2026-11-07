import { describe, expect, it } from 'vitest'
import { contrastOn, defaultConfig, initials, viewIn, withDefaults } from '@/invite/config'
import { formatInviteDate, formatInviteTime } from '@/invite/labels'

describe('invite config', () => {
  it('fills sections and keys a stored design is missing', () => {
    const config = withDefaults({ design: { background: '#000000' } } as never)
    expect(config.design.background).toBe('#000000')
    expect(config.design.font).toBe('classic')
    expect(config.animation.style).toBe('gatefold')
    expect(config.content.gallery).toEqual([])
  })

  it("shows the event's own date and venue", () => {
    const config = defaultConfig()
    const event = { date: '2026-12-12', venue: 'Sokha Hotel' }
    expect(viewIn(config, 'km', event)).toMatchObject({ date: '2026-12-12', venue: 'Sokha Hotel', language: 'km' })
    expect(viewIn(config, 'km', null)).toMatchObject({ date: '', venue: '' })
  })

  it('shows the words in the language asked for, borrowing names, places and the message when blank', () => {
    const config = defaultConfig()
    Object.assign(config.content.text.km, { partner1: 'សុខា', title: 'សិរីមង្គល' })
    Object.assign(config.content.text.en, { partner1: 'Sokha', message: 'Welcome' })
    // A blank English title stays blank: the card shows the English default wording, not the Khmer title.
    expect(viewIn(config, 'en')).toMatchObject({ partner1: 'Sokha', title: '', message: 'Welcome', language: 'en' })
    expect(viewIn(config, 'km')).toMatchObject({ partner1: 'សុខា', title: 'សិរីមង្គល', message: 'Welcome' })
  })

  it('shows the programme in the language asked for, borrowing blank words', () => {
    const config = defaultConfig()
    config.content.timeline = [
      {
        date: '',
        maps_url: 'https://maps.app.goo.gl/a',
        text: { km: { title: 'ពេលព្រឹក', place: '', address: '' }, en: { title: '', place: 'Home', address: '' } },
        items: [{ time: '06:30', text: { km: { title: 'ភ្ញៀវមកដល់' }, en: { title: 'Guests arrive' } } }],
      },
    ]
    expect(viewIn(config, 'en').timeline).toEqual([
      {
        date: '',
        maps_url: 'https://maps.app.goo.gl/a',
        title: 'ពេលព្រឹក',
        place: 'Home',
        address: '',
        items: [{ time: '06:30', title: 'Guests arrive' }],
      },
    ])
    expect(viewIn(config, 'km').timeline[0]).toMatchObject({ title: 'ពេលព្រឹក', place: 'Home', items: [{ title: 'ភ្ញៀវមកដល់' }] })
  })

  it('reads a design from before bilingual words in the new shape', () => {
    const old = { content: { language: 'en', title: 'Old title', partner1: 'Sokha', venue: 'Old hall', date: '2026-12-12' } }
    const config = withDefaults(old as never)
    expect(config.content.text.en).toEqual({ title: 'Old title', partner1: 'Sokha', partner2: '', greeting: '', message: '', thanks: '', apology: '' })
    expect(config.content.text.km.title).toBe('')
    // Fields the editor no longer has (date, venue: now in the programme) are left out.
    expect(Object.keys(config.content).sort()).toEqual(['bank_qrs', 'gallery', 'hero_photo', 'language', 'text', 'timeline'])
    expect(config.audio).toEqual({ music: 'musicbox', music_file: null, volume: 60, open_sound: true })
  })

  it('takes initials for the monogram, Khmer names included', () => {
    expect(initials({ partner1: 'sokha', partner2: 'Dara' })).toEqual(['S', 'D'])
    expect(initials({ partner1: 'សុខា', partner2: '' })).toEqual(['ស', ''])
  })

  it('picks readable text on light and dark covers', () => {
    expect(contrastOn('#fbf6ee')).toBe('#2b1418')
    expect(contrastOn('#6e1423')).toBe('#fbf3e4')
  })
})

describe('invite dates and times', () => {
  it('writes Khmer dates and times itself, with Khmer numerals', () => {
    expect(formatInviteDate('2026-12-12', 'km')).toBe('ថ្ងៃសៅរ៍ ទី១២ ខែធ្នូ ឆ្នាំ២០២៦')
    expect(formatInviteTime('17:30', 'km')).toBe('ម៉ោង ៥:៣០ ល្ងាច')
    expect(formatInviteTime('09:05', 'km')).toBe('ម៉ោង ៩:០៥ ព្រឹក')
  })

  it('formats English dates and times', () => {
    expect(formatInviteDate('2026-12-12', 'en')).toBe('Saturday, 12 December 2026')
    expect(formatInviteTime('17:30', 'en')).toBe('5:30 PM')
  })

  it('shows nothing for blank values', () => {
    expect(formatInviteDate('', 'en')).toBe('')
    expect(formatInviteTime('', 'km')).toBe('')
  })
})
