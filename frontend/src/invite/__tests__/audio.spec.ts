import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InviteAudio, type SoundSettings } from '@/invite/audio'

const settings: SoundSettings = { music: 'musicbox', songUrl: null, volume: 60, openSound: true }

let play: ReturnType<typeof vi.fn>
let pause: ReturnType<typeof vi.fn>
beforeEach(() => {
  play = vi.fn(() => Promise.resolve())
  pause = vi.fn()
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(play as never)
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(pause as never)
})
afterEach(() => {
  vi.restoreAllMocks()
  delete (navigator as unknown as { audioSession?: unknown }).audioSession
})

describe('InviteAudio on iPhones (the Ring/Silent switch)', () => {
  it('marks the sound as media playback and starts the silent track within the tap', () => {
    const session = { type: 'auto' }
    Object.defineProperty(navigator, 'audioSession', { value: session, configurable: true })
    const audio = new InviteAudio(settings)
    audio.unlock()
    expect(session.type).toBe('playback')
    expect(play).toHaveBeenCalledTimes(1)
    const track = play.mock.contexts[0] as HTMLAudioElement
    expect(track.src).toMatch(/^data:audio\/wav;base64,UklGR/) // a real WAV file ("RIFF")
    expect(track.loop).toBe(true)
    audio.dispose()
  })

  it('stays quiet when the guest turned sound off, and follows the sound button', () => {
    const audio = new InviteAudio(settings, true)
    audio.unlock()
    expect(play).not.toHaveBeenCalled()
    audio.setMuted(false)
    expect(play).toHaveBeenCalledTimes(1)
    audio.setMuted(true)
    expect(pause).toHaveBeenCalled()
    audio.dispose()
  })

  it('copes with browsers whose play() refuses or returns nothing', () => {
    play.mockImplementation(() => {
      throw new Error('NotAllowedError')
    })
    const audio = new InviteAudio(settings)
    expect(() => audio.unlock()).not.toThrow()
    play.mockImplementation(() => undefined as never)
    expect(() => audio.setMuted(false)).not.toThrow()
    audio.dispose()
  })
})
