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

  it("uses the event's date and venue where the design leaves them blank", () => {
    const config = defaultConfig()
    const event = { date: '2026-12-12', venue: 'Sokha Hotel' }
    expect(viewIn(config, 'km', event)).toMatchObject({ date: '2026-12-12', venue: 'Sokha Hotel', language: 'km' })
    config.content.text.km.venue = 'Garden'
    expect(viewIn(config, 'km', event).venue).toBe('Garden')
    expect(viewIn(config, 'km', null).date).toBe('') // public data comes already filled in
  })

  it('shows the words in the language asked for, borrowing names, places and the message when blank', () => {
    const config = defaultConfig()
    Object.assign(config.content.text.km, { partner1: 'សុខា', title: 'សិរីមង្គល' })
    Object.assign(config.content.text.en, { partner1: 'Sokha', message: 'Welcome' })
    // A blank English title stays blank: the card shows the English default wording, not the Khmer title.
    expect(viewIn(config, 'en')).toMatchObject({ partner1: 'Sokha', title: '', message: 'Welcome', language: 'en' })
    expect(viewIn(config, 'km')).toMatchObject({ partner1: 'សុខា', title: 'សិរីមង្គល', message: 'Welcome' })
  })

  it('reads a design from before bilingual words in the new shape', () => {
    const old = { content: { language: 'en', title: 'Old title', partner1: 'Sokha', date: '2026-12-12' } }
    const config = withDefaults(old as never)
    expect(config.content.text.en).toMatchObject({ title: 'Old title', partner1: 'Sokha', greeting: '' })
    expect(config.content.text.km.title).toBe('')
    expect(config.content.date).toBe('2026-12-12')
    expect('title' in config.content).toBe(false)
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
