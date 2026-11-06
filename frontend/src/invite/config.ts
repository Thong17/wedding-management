/**
 * The e-invite design, shared by the editor, its previews and the public page. Mirrors
 * backend/invites/config.py: same keys, option lists and defaults. The server cleans every save, so
 * this side only needs to know the shape and the choices.
 */

export const FONTS = ['classic', 'romantic', 'modern', 'khmer-royal', 'khmer-elegant'] as const
export const CARD_STYLES = ['framed', 'ornate', 'minimal'] as const
export const OPENING_STYLES = ['gatefold', 'envelope', 'fade'] as const
export const EMBLEMS = ['monogram', 'seal', 'image'] as const
export const LANGUAGES = ['km', 'en'] as const
export const MAX_GALLERY = 12

export type InviteFont = (typeof FONTS)[number]
export type CardStyle = (typeof CARD_STYLES)[number]
export type OpeningStyle = (typeof OPENING_STYLES)[number]
export type Emblem = (typeof EMBLEMS)[number]
export type InviteLanguage = (typeof LANGUAGES)[number]

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
    language: InviteLanguage
    greeting: string
    title: string
    partner1: string
    partner2: string
    /** ISO date; blank = the event's date. */
    date: string
    /** HH:MM, or blank. */
    time: string
    /** Blank = the event's venue. */
    venue: string
    address: string
    message: string
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
}

/** Screens the editor can preview on. */
export type PreviewDevice = 'phone' | 'tablet' | 'desktop'

/** Picture id (as a string key) → URL. */
export type InviteImages = Record<string, string>

export function defaultConfig(): InviteConfig {
  return {
    version: 1,
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
      greeting: '',
      title: '',
      partner1: '',
      partner2: '',
      date: '',
      time: '',
      venue: '',
      address: '',
      message: '',
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
  }
}

/** A complete design from a stored or partial one (sections and keys missing from it get defaults). */
export function withDefaults(config: Partial<InviteConfig> | null | undefined): InviteConfig {
  const base = defaultConfig()
  if (!config) return base
  return {
    ...base,
    ...config,
    design: { ...base.design, ...config.design },
    content: { ...base.content, ...config.content },
    animation: { ...base.animation, ...config.animation },
  }
}

/** The design's content with the event's date and venue where the design leaves them blank. */
export function effectiveContent(config: InviteConfig, event?: { date: string; venue: string } | null): InviteConfig['content'] {
  const content = config.content
  if (!event) return content
  return { ...content, date: content.date || event.date, venue: content.venue || event.venue }
}

/** The couple's initials for the monogram seal, e.g. "S & D". Khmer names keep their first character. */
export function initials(content: Pick<InviteConfig['content'], 'partner1' | 'partner2'>): [string, string] {
  const first = (name: string) => Array.from(name.trim())[0]?.toUpperCase() ?? ''
  return [first(content.partner1), first(content.partner2)]
}

/** Readable text color on a background: dark ink on light colors, ivory on dark ones. */
export function contrastOn(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#2b1418' : '#fbf3e4'
}
