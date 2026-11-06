/**
 * The e-invite design, shared by the editor, its previews and the public page. Mirrors
 * backend/invites/config.py: same keys, option lists and defaults. The server cleans every save, so
 * this side only needs to know the shape and the choices.
 *
 * The invitation's words are written per language (content.text.km / content.text.en) so guests can
 * switch between Khmer and English; content.language is the one it opens in. Version 1 designs (one
 * language, the words directly in content) are converted by withDefaults.
 */

export const FONTS = ['classic', 'romantic', 'modern', 'khmer-royal', 'khmer-elegant'] as const
export const CARD_STYLES = ['framed', 'ornate', 'minimal'] as const
export const OPENING_STYLES = ['gatefold', 'envelope', 'fade'] as const
export const EMBLEMS = ['monogram', 'seal', 'image'] as const
export const LANGUAGES = ['km', 'en'] as const
/** Background music: tunes the browser plays itself (no files), the organizer's own song, or none. */
export const MUSIC = ['musicbox', 'harp', 'upload', 'none'] as const
export const MAX_GALLERY = 12
export const TEXT_KEYS = ['greeting', 'title', 'partner1', 'partner2', 'venue', 'address', 'message'] as const

export type InviteFont = (typeof FONTS)[number]
export type CardStyle = (typeof CARD_STYLES)[number]
export type OpeningStyle = (typeof OPENING_STYLES)[number]
export type Emblem = (typeof EMBLEMS)[number]
export type InviteLanguage = (typeof LANGUAGES)[number]
export type Music = (typeof MUSIC)[number]

/** The invitation's words in one language. Blank venue = the event's venue. */
export type InviteText = Record<(typeof TEXT_KEYS)[number], string>

export interface InviteConfig {
  version: number
  template: 'classic'
  design: {
    background: string
    text_color: string
    accent: string
    font: InviteFont
    card_style: CardStyle
    gold_corners: boolean
    gold_border: boolean
    gold_dividers: boolean
    sparkles: boolean
  }
  content: {
    /** The language the invitation opens in; guests can switch. */
    language: InviteLanguage
    text: Record<InviteLanguage, InviteText>
    /** ISO date; blank = the event's date. */
    date: string
    /** HH:MM, or blank. */
    time: string
    maps_url: string
    /** Picture ids (see images maps). */
    hero_photo: number | null
    gallery: number[]
  }
  animation: {
    enabled: boolean
    style: OpeningStyle
    cover_color: string
    emblem: Emblem
    particles: boolean
    cover_image: number | null
    emblem_image: number | null
  }
  audio: {
    music: Music
    /** The organizer's song (an upload id), for music = 'upload'. */
    music_file: number | null
    /** 0–100. */
    volume: number
    /** A soft chime when the invitation opens. */
    open_sound: boolean
  }
}

/** What the invitation shows in one language: the words with the dates and pictures. */
export type InviteView = InviteText & Omit<InviteConfig['content'], 'text'>

/** Screens the editor can preview on. */
export type PreviewDevice = 'phone' | 'tablet' | 'desktop'

/** Upload id (as a string key) → URL: pictures and the song. */
export type InviteImages = Record<string, string>

export const emptyText = (): InviteText => ({ greeting: '', title: '', partner1: '', partner2: '', venue: '', address: '', message: '' })

export function defaultConfig(): InviteConfig {
  return {
    version: 2,
    template: 'classic',
    design: {
      background: '#fbf6ee',
      text_color: '#4a1d27',
      accent: '#c9a14a',
      font: 'classic',
      card_style: 'framed',
      gold_corners: true,
      gold_border: true,
      gold_dividers: true,
      sparkles: true,
    },
    content: {
      language: 'km',
      text: { km: emptyText(), en: emptyText() },
      date: '',
      time: '',
      maps_url: '',
      hero_photo: null,
      gallery: [],
    },
    animation: {
      enabled: true,
      style: 'gatefold',
      cover_color: '#6e1423',
      emblem: 'monogram',
      particles: true,
      cover_image: null,
      emblem_image: null,
    },
    audio: { music: 'musicbox', music_file: null, volume: 60, open_sound: true },
  }
}

type StoredContent = Partial<InviteConfig['content']> & Partial<InviteText>

/** A complete design from a stored or partial one (sections and keys missing from it get defaults). */
export function withDefaults(config: (Partial<Omit<InviteConfig, 'content'>> & { content?: StoredContent }) | null | undefined): InviteConfig {
  const base = defaultConfig()
  if (!config) return base
  const stored: StoredContent = config.content ?? {}
  const language = stored.language ?? base.content.language
  // Version 1: the words sat directly in content, in its one language.
  const text = stored.text ?? {
    [language]: Object.fromEntries(TEXT_KEYS.filter((k) => typeof stored[k] === 'string').map((k) => [k, stored[k]])),
  }
  const { text: _text, ...rest } = stored
  const flat = Object.fromEntries(Object.entries(rest).filter(([k]) => !(TEXT_KEYS as readonly string[]).includes(k)))
  return {
    ...base,
    ...config,
    version: 2,
    design: { ...base.design, ...config.design },
    content: {
      ...base.content,
      ...flat,
      text: { km: { ...emptyText(), ...text.km }, en: { ...emptyText(), ...text.en } },
    },
    animation: { ...base.animation, ...config.animation },
    audio: { ...base.audio, ...config.audio },
  }
}

const other = (language: InviteLanguage): InviteLanguage => (language === 'km' ? 'en' : 'km')

// Left blank in one language, these show the other language's words (names, places, the message), so a
// one-language invitation still reads fully. A blank title or greeting shows the language's own default
// wording instead (invite/labels.ts).
const BORROWED: readonly string[] = ['partner1', 'partner2', 'venue', 'address', 'message']

/**
 * What the invitation shows in `language`: its words there (some borrowed from the other language when
 * blank, see BORROWED), and the event's date and venue where the design leaves them blank.
 */
export function viewIn(config: InviteConfig, language: InviteLanguage, event?: { date: string; venue: string } | null): InviteView {
  const { text, ...content } = config.content
  const words = text[language]
  const fallback = text[other(language)]
  const merged = Object.fromEntries(TEXT_KEYS.map((k) => [k, words[k] || (BORROWED.includes(k) ? fallback[k] : '')])) as InviteText
  return {
    ...content,
    ...merged,
    language,
    date: content.date || event?.date || '',
    venue: merged.venue || event?.venue || '',
  }
}

/** The couple's initials for the monogram seal, e.g. "S & D". Khmer names keep their first character. */
export function initials(names: Pick<InviteText, 'partner1' | 'partner2'>): [string, string] {
  const first = (name: string) => Array.from(name.trim())[0]?.toUpperCase() ?? ''
  return [first(names.partner1), first(names.partner2)]
}

/** Readable text color on a background: dark ink on light colors, ivory on dark ones. */
export function contrastOn(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#2b1418' : '#fbf3e4'
}
