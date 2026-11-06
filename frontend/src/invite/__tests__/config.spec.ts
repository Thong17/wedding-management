import { describe, expect, it } from 'vitest'
import { contrastOn, defaultConfig, effectiveContent, initials, withDefaults } from '@/invite/config'
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
    expect(effectiveContent(config, event)).toMatchObject({ date: '2026-12-12', venue: 'Sokha Hotel' })
    config.content.venue = 'Garden'
    expect(effectiveContent(config, event).venue).toBe('Garden')
    expect(effectiveContent(config, null).date).toBe('') // public data comes already filled in
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
