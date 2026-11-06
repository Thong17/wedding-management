import type { Music } from './config'

/**
 * The invitation's sound: a soft chime and whoosh when it opens (backwards when it closes) and the
 * background music, either one of two tunes the browser plays itself (original, no audio files) or the
 * organizer's own song.
 *
 * Browsers only allow sound after a tap, so nothing exists until `unlock()` is called from one (the tap
 * that opens the invitation, or the sound button). The music fades in and out, pauses while the page is
 * hidden, and `setMuted` silences everything.
 */
export interface SoundSettings {
  music: Music
  /** The uploaded song's URL, for music = 'upload'. */
  songUrl: string | null
  /** 0–100. */
  volume: number
  openSound: boolean
}

type Tune = { notes: number[][]; bass: number[]; step: number; voice: 'bell' | 'pluck' }

// Chords as MIDI notes, played as gentle arpeggios.
const TUNES: Record<'musicbox' | 'harp', Tune> = {
  // C – Am – F – G, high and bell-like.
  musicbox: {
    notes: [
      [72, 76, 79, 84, 79, 76],
      [69, 72, 76, 81, 76, 72],
      [65, 69, 72, 77, 72, 69],
      [67, 71, 74, 79, 74, 71],
    ],
    bass: [48, 45, 41, 43],
    step: 0.34,
    voice: 'bell',
  },
  // F – Dm – Bb – C, rolled like a harp.
  harp: {
    notes: [
      [53, 57, 60, 65, 69, 72, 69, 65],
      [50, 53, 57, 62, 65, 69, 65, 62],
      [46, 50, 53, 58, 62, 65, 62, 58],
      [48, 52, 55, 60, 64, 67, 64, 60],
    ],
    bass: [41, 38, 34, 36],
    step: 0.26,
    voice: 'pluck',
  },
}

const freq = (midi: number) => 440 * 2 ** ((midi - 69) / 12)

export class InviteAudio {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private musicBus: GainNode | null = null
  private echo: DelayNode | null = null
  private song: HTMLAudioElement | null = null
  private songNode: MediaElementAudioSourceNode | null = null
  private scheduler: ReturnType<typeof setInterval> | undefined
  private nextNote = 0
  private noteIndex = 0
  private musicOn = false
  private muted: boolean
  private settings: SoundSettings
  private keepAlive: HTMLAudioElement | null = null
  private readonly onVisibility = () => this.visibilityChanged()
  // iOS may leave the engine "interrupted" (after a call, the lock screen, another app) and only lets a
  // tap restart it: any tap on the page does.
  private readonly onTap = () => this.wake()

  constructor(settings: SoundSettings, muted = false) {
    this.settings = settings
    this.muted = muted
    document.addEventListener('visibilitychange', this.onVisibility)
    document.addEventListener('pointerdown', this.onTap, true)
  }

  /** Create the audio engine. Must run inside a tap (browsers block sound otherwise). */
  unlock() {
    this.playThroughSilentSwitch()
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!this.ctx && Ctx) {
      this.ctx = new Ctx()
      this.master = this.ctx.createGain()
      this.master.gain.value = this.muted ? 0 : 1
      this.master.connect(this.ctx.destination)
      this.musicBus = this.ctx.createGain()
      this.musicBus.gain.value = 0
      // A soft echo gives the synthesized tunes some space.
      this.echo = this.ctx.createDelay(1)
      this.echo.delayTime.value = 0.33
      const feedback = this.ctx.createGain()
      feedback.gain.value = 0.28
      const tone = this.ctx.createBiquadFilter()
      tone.type = 'lowpass'
      tone.frequency.value = 2600
      this.echo.connect(tone).connect(feedback).connect(this.echo)
      tone.connect(this.musicBus)
      this.musicBus.connect(this.master)
    }
    void this.ctx?.resume()
    // An uploaded song has to start playing within the tap too (iOS); it stays silent until faded in.
    if (this.settings.music === 'upload' && this.settings.songUrl) playQuietly(this.prepareSong())
  }

  /** Chime and whoosh as the invitation opens; `reverse` (closing) runs the chime downward. */
  playTransition(reverse = false) {
    const ctx = this.ctx
    if (!ctx || !this.master || !this.settings.openSound) return
    const now = ctx.currentTime + 0.02
    this.whoosh(now, reverse)
    const chime = [79, 84, 88, 91, 96]
    ;(reverse ? [...chime].reverse() : chime).forEach((note, i) => this.bell(freq(note), now + 0.25 + i * 0.09, 0.12, 2.2, this.master!))
  }

  /** Start the background music, fading in. */
  startMusic() {
    this.musicOn = true
    if (!this.ctx || this.muted || document.hidden) return
    const { music, songUrl } = this.settings
    if (music === 'none') return
    this.fadeMusic(this.musicLevel(), 2.5)
    if (music === 'upload') {
      if (songUrl) playQuietly(this.prepareSong())
      return
    }
    if (this.scheduler) return
    this.nextNote = this.ctx.currentTime + 0.1
    this.scheduler = setInterval(() => this.schedule(), 60)
  }

  stopMusic() {
    this.musicOn = false
    this.pauseMusic()
  }

  setMuted(muted: boolean) {
    this.muted = muted
    if (muted) this.keepAlive?.pause()
    else playQuietly(this.keepAlive)
    if (!this.ctx || !this.master) return
    this.master.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.15)
    if (muted) this.pauseMusic()
    else if (this.musicOn) this.startMusic()
  }

  /** New settings (the organizer is editing): restart the music the new way if it is playing. */
  update(settings: SoundSettings) {
    const changed = settings.music !== this.settings.music || settings.songUrl !== this.settings.songUrl
    this.settings = settings
    if (changed) {
      this.pauseMusic(true)
      this.song = null
      this.songNode?.disconnect()
      this.songNode = null
      if (this.musicOn) this.startMusic()
    } else if (this.musicOn && !this.muted) {
      this.fadeMusic(this.musicLevel(), 0.3)
    }
  }

  dispose() {
    document.removeEventListener('visibilitychange', this.onVisibility)
    document.removeEventListener('pointerdown', this.onTap, true)
    clearInterval(this.scheduler)
    this.song?.pause()
    this.keepAlive?.pause()
    void this.ctx?.close()
    this.ctx = null
  }

  /**
   * iPhones treat sound made in the browser like a game's: the Ring/Silent switch mutes it, so most
   * guests would hear nothing. Mark this page's sound as media playback instead (like a video), which
   * plays on silent too: the Audio Session API where Safari has it (iOS 17+), and on older iOS by playing
   * a silent looping track, which switches the page to playback. Runs within the tap, as play() must.
   */
  private playThroughSilentSwitch() {
    const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession
    if (session) {
      try {
        session.type = 'playback'
      } catch {
        // not allowed here: the silent track below still works
      }
    }
    if (!this.keepAlive) {
      this.keepAlive = new Audio(silentWav())
      this.keepAlive.loop = true
      this.keepAlive.setAttribute('playsinline', '')
    }
    if (!this.muted) playQuietly(this.keepAlive)
  }

  /** A tap after iOS interrupted the sound: pick up again. */
  private wake() {
    if (!this.ctx || this.muted) return
    if (this.ctx.state !== 'running') void this.ctx.resume()
    if (this.keepAlive?.paused) playQuietly(this.keepAlive)
    if (this.musicOn && !document.hidden) this.startMusic()
  }

  private musicLevel() {
    // Synthesized tunes are quieter than mastered songs; both follow the organizer's volume.
    const base = this.settings.music === 'upload' ? 0.9 : 0.55
    return base * Math.max(0, Math.min(100, this.settings.volume)) / 100
  }

  private fadeMusic(level: number, seconds: number) {
    if (!this.ctx || !this.musicBus) return
    const g = this.musicBus.gain
    g.cancelScheduledValues(this.ctx.currentTime)
    g.setValueAtTime(g.value, this.ctx.currentTime)
    g.linearRampToValueAtTime(level, this.ctx.currentTime + seconds)
    // Without the audio graph (a song from another origin), fade the element itself.
    if (this.song && !this.songNode) this.song.volume = Math.min(1, level)
  }

  private pauseMusic(now = false) {
    clearInterval(this.scheduler)
    this.scheduler = undefined
    this.fadeMusic(0, now ? 0.05 : 0.6)
    const song = this.song
    if (song) setTimeout(() => !this.musicOn || this.muted || document.hidden ? song.pause() : undefined, now ? 60 : 650)
  }

  private visibilityChanged() {
    if (!this.ctx) return
    if (document.hidden) {
      this.pauseMusic()
      setTimeout(() => {
        if (!document.hidden) return
        this.keepAlive?.pause()
        void this.ctx?.suspend()
      }, 700)
    } else if (!this.muted) {
      void this.ctx.resume()
      playQuietly(this.keepAlive)
      if (this.musicOn) this.startMusic()
    }
  }

  private prepareSong(): HTMLAudioElement | null {
    const url = this.settings.songUrl
    if (!url || !this.ctx || !this.musicBus) return null
    if (this.song) return this.song
    const song = new Audio()
    song.loop = true
    song.preload = 'auto'
    song.src = url
    // Through the audio graph for smooth fades (iOS ignores an element's volume). Only for songs on our
    // own domain: anything else would play silently through the graph without CORS headers.
    if (new URL(url, location.href).origin === location.origin) {
      this.songNode = this.ctx.createMediaElementSource(song)
      this.songNode.connect(this.musicBus)
    } else {
      song.volume = 0
    }
    this.song = song
    return song
  }

  private schedule() {
    const ctx = this.ctx
    if (!ctx || !this.musicBus || !this.echo) return
    const music = this.settings.music
    if (music !== 'musicbox' && music !== 'harp') return
    const tune = TUNES[music]
    const perChord = tune.notes[0].length
    while (this.nextNote < ctx.currentTime + 0.25) {
      const chord = Math.floor(this.noteIndex / perChord) % tune.notes.length
      const note = tune.notes[chord][this.noteIndex % perChord]
      const time = this.nextNote
      if (tune.voice === 'bell') this.bell(freq(note), time, 0.09, 1.8, this.musicBus, this.echo)
      else this.pluck(freq(note), time, 0.11, 2.4)
      if (this.noteIndex % perChord === 0) this.pluck(freq(tune.bass[chord]), time, 0.12, 3.2)
      this.noteIndex++
      this.nextNote += tune.step
    }
  }

  /** A bell: a sine with two quiet overtones, a quick strike and a long fade. */
  private bell(hz: number, at: number, level: number, decay: number, out: AudioNode, send?: AudioNode) {
    const ctx = this.ctx!
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, at)
    gain.gain.linearRampToValueAtTime(level, at + 0.008)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + decay)
    gain.connect(out)
    if (send) gain.connect(send)
    for (const [ratio, amp] of [[1, 1], [2.76, 0.18], [5.4, 0.06]] as const) {
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.frequency.value = hz * ratio
      g.gain.value = amp
      osc.connect(g).connect(gain)
      osc.start(at)
      osc.stop(at + decay + 0.05)
    }
  }

  /** A plucked string: a bright triangle wave mellowing as it fades. */
  private pluck(hz: number, at: number, level: number, decay: number) {
    const ctx = this.ctx!
    const osc = ctx.createOscillator()
    osc.type = 'triangle'
    osc.frequency.value = hz
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(Math.min(8000, hz * 8), at)
    filter.frequency.exponentialRampToValueAtTime(Math.max(200, hz * 1.5), at + decay)
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, at)
    gain.gain.linearRampToValueAtTime(level, at + 0.005)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + decay)
    osc.connect(filter).connect(gain)
    gain.connect(this.musicBus!)
    gain.connect(this.echo!)
    osc.start(at)
    osc.stop(at + decay + 0.05)
  }

  /** Paper sliding: filtered noise sweeping up (or down when closing). */
  private whoosh(at: number, reverse: boolean) {
    const ctx = this.ctx!
    const length = 1.1
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * length), ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    const noise = ctx.createBufferSource()
    noise.buffer = buffer
    const band = ctx.createBiquadFilter()
    band.type = 'bandpass'
    band.Q.value = 0.9
    band.frequency.setValueAtTime(reverse ? 2800 : 350, at)
    band.frequency.exponentialRampToValueAtTime(reverse ? 350 : 2800, at + length * 0.8)
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, at)
    gain.gain.linearRampToValueAtTime(0.16, at + 0.35)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length)
    noise.connect(band).connect(gain).connect(this.master!)
    noise.start(at)
    noise.stop(at + length)
  }
}

/** Start playing, ignoring refusals (no tap yet) and browsers whose play() returns no promise. */
function playQuietly(media: HTMLMediaElement | null) {
  try {
    void media?.play()?.catch(() => undefined)
  } catch {
    // refused: a later tap tries again
  }
}

let silentUrl: string | null = null
/** Half a second of silence as a WAV file (8 kHz, 8-bit mono), built once, for the silent-switch workaround. */
function silentWav(): string {
  if (silentUrl) return silentUrl
  const samples = 4000
  const bytes = new Uint8Array(44 + samples)
  const view = new DataView(bytes.buffer)
  const text = (at: number, s: string) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)))
  text(0, 'RIFF')
  view.setUint32(4, 36 + samples, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  view.setUint32(16, 16, true) // format chunk size
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, 8000, true) // sample rate
  view.setUint32(28, 8000, true) // bytes per second
  view.setUint16(32, 1, true) // block align
  view.setUint16(34, 8, true) // bits per sample
  text(36, 'data')
  view.setUint32(40, samples, true)
  bytes.fill(128, 44) // 8-bit silence is the middle value
  let binary = ''
  bytes.forEach((b) => (binary += String.fromCharCode(b)))
  silentUrl = `data:audio/wav;base64,${btoa(binary)}`
  return silentUrl
}

const SOUND_KEY = 'wms.inviteSound'

/** The guest's sound choice, kept on this phone. On unless they turned it off. */
export function soundPreference(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== 'off'
  } catch {
    return true
  }
}

export function saveSoundPreference(on: boolean) {
  try {
    localStorage.setItem(SOUND_KEY, on ? 'on' : 'off')
  } catch {
    // storage blocked: the choice lasts for this visit
  }
}
