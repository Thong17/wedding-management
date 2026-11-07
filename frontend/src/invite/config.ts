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
/** How the programme's moments are drawn: a winding road, or a straight line down the middle. */
export const ROUTE_STYLES = ['road', 'line'] as const
/**
 * Where the ornate gold frame (corner flourishes, a diamond on top) is used. Areas left out get a plain
 * frame (programme, maps, gifts) or none (hero photo, names, gallery).
 */
export const ORNATE_AREAS = ['hero', 'names', 'programme', 'maps', 'gifts', 'gallery'] as const
/** The ornate frame's look (src/invite/ornate.css). */
export const ORNATE_STYLES = ['royal', 'khmer', 'chinese', 'minimal', 'modern'] as const
export const OPENING_STYLES = ['gatefold', 'envelope', 'fade'] as const
export const EMBLEMS = ['monogram', 'seal', 'image'] as const
export const LANGUAGES = ['km', 'en'] as const
/** Background music: tunes the browser plays itself (no files), the organizer's own song, or none. */
export const MUSIC = ['musicbox', 'harp', 'upload', 'none'] as const
export const MAX_GALLERY = 12
export const MAX_BANK_QRS = 2
export const TEXT_KEYS = ['greeting', 'title', 'partner1', 'partner2', 'message'] as const

export type InviteFont = (typeof FONTS)[number]
export type CardStyle = (typeof CARD_STYLES)[number]
export type RouteStyle = (typeof ROUTE_STYLES)[number]
export type OrnateArea = (typeof ORNATE_AREAS)[number]
export type OrnateStyle = (typeof ORNATE_STYLES)[number]
export type OpeningStyle = (typeof OPENING_STYLES)[number]
export type Emblem = (typeof EMBLEMS)[number]
export type InviteLanguage = (typeof LANGUAGES)[number]
export type Music = (typeof MUSIC)[number]

/** The invitation's words in one language. Dates, times, places and maps are in the programme. */
export type InviteText = Record<(typeof TEXT_KEYS)[number], string>

/**
 * The programme: parts of the day (e.g. the morning at the bride's home, the evening at a hotel), each
 * with its own date, place and map, holding its moments in order (6:30 guests arrive, 7:00 start, …).
 */
export const MAX_PARTS = 10
export const MAX_MOMENTS = 30
export interface PartText {
  /** e.g. "Morning", "Wedding reception". */
  title: string
  place: string
  address: string
}
export interface ProgrammeMoment {
  /** HH:MM, or blank. */
  time: string
  text: Record<InviteLanguage, { title: string }>
}
export interface ProgrammePart {
  /** ISO date, or blank. */
  date: string
  maps_url: string
  text: Record<InviteLanguage, PartText>
  items: ProgrammeMoment[]
}
/** A part of the programme as shown in one language. */
export type PartView = Omit<ProgrammePart, 'text' | 'items'> & PartText & { items: { time: string; title: string }[] }

const emptyPartText = (): PartText => ({ title: '', place: '', address: '' })
export const newMoment = (): ProgrammeMoment => ({ time: '', text: { km: { title: '' }, en: { title: '' } } })
export const newPart = (): ProgrammePart => ({
  date: '',
  maps_url: '',
  text: { km: emptyPartText(), en: emptyPartText() },
  items: [newMoment()],
})

/** A stored part with every field (older or partial data filled in). */
function completePart(part: Partial<ProgrammePart>): ProgrammePart {
  return {
    date: part.date ?? '',
    maps_url: part.maps_url ?? '',
    text: { km: { ...emptyPartText(), ...part.text?.km }, en: { ...emptyPartText(), ...part.text?.en } },
    items: (part.items ?? []).map((m) => ({
      time: m.time ?? '',
      text: { km: { title: m.text?.km?.title ?? '' }, en: { title: m.text?.en?.title ?? '' } },
    })),
  }
}

export interface InviteConfig {
  version: number
  template: 'classic'
  design: {
    background: string
    text_color: string
    accent: string
    font: InviteFont
    card_style: CardStyle
    route_style: RouteStyle
    ornate_frames: OrnateArea[]
    ornate_style: OrnateStyle
    /** The couple's names, as a percentage of their usual size (cover and card), 60–160. */
    names_size: number
    /** Which part of the main photo shows: 0–100 % across and down (50 = centre). */
    hero_x: number
    hero_y: number
    gold_corners: boolean
    gold_border: boolean
    gold_dividers: boolean
    sparkles: boolean
  }
  content: {
    /** The language the invitation opens in; guests can switch. */
    language: InviteLanguage
    text: Record<InviteLanguage, InviteText>
    /** The programme: parts of the day, each with its moments. */
    timeline: ProgrammePart[]
    /** Picture ids (see images maps). */
    hero_photo: number | null
    gallery: number[]
    /** Bank QR codes for gifts (at most two), shown below the message. */
    bank_qrs: BankQr[]
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
export type InviteView = InviteText &
  Omit<InviteConfig['content'], 'text' | 'timeline'> & {
    timeline: PartView[]
    /** The event's date and venue (the venue is shown only without a programme). */
    date: string
    venue: string
  }

/** A bank QR code for gifts: an uploaded picture and an optional label (bank or account name). */
export interface BankQr {
  image: number
  label: string
}

/** Screens the editor can preview on. */
export type PreviewDevice = 'phone' | 'tablet' | 'desktop'

/** Upload id (as a string key) → URL: pictures and the song. */
export type InviteImages = Record<string, string>

export const emptyText = (): InviteText => ({ greeting: '', title: '', partner1: '', partner2: '', message: '' })

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
      route_style: 'road',
      ornate_frames: [...ORNATE_AREAS],
      ornate_style: 'royal',
      names_size: 100,
      hero_x: 50,
      hero_y: 50,
      gold_corners: true,
      gold_border: true,
      gold_dividers: true,
      sparkles: true,
    },
    content: {
      language: 'km',
      text: { km: emptyText(), en: emptyText() },
      timeline: [],
      hero_photo: null,
      gallery: [],
      bank_qrs: [],
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
  // Only today's fields: older designs also had a date, time, venue, address and map here, now in the
  // programme, and keeping them would only make an unchanged design look edited.
  const words = (given?: Partial<InviteText>): InviteText =>
    Object.fromEntries(TEXT_KEYS.map((k) => [k, typeof given?.[k] === 'string' ? given[k] : ''])) as InviteText
  return {
    ...base,
    ...config,
    version: 2,
    design: { ...base.design, ...config.design },
    content: {
      language,
      text: { km: words(text.km), en: words(text.en) },
      timeline: (stored.timeline ?? []).map(completePart),
      hero_photo: stored.hero_photo ?? null,
      gallery: stored.gallery ?? [],
      bank_qrs: (stored.bank_qrs ?? []).map((qr) => ({ image: qr.image, label: qr.label ?? '' })),
    },
    animation: { ...base.animation, ...config.animation },
    audio: { ...base.audio, ...config.audio },
  }
}

const other = (language: InviteLanguage): InviteLanguage => (language === 'km' ? 'en' : 'km')

// Left blank in one language, these show the other language's words (the names, the message), so a
// one-language invitation still reads fully. A blank title or greeting shows the language's own default
// wording instead (invite/labels.ts).
const BORROWED: readonly string[] = ['partner1', 'partner2', 'message']

/**
 * What the invitation shows in `language`: its words there (some borrowed from the other language when
 * blank, see BORROWED), the programme, and the event's date and venue.
 */
export function viewIn(config: InviteConfig, language: InviteLanguage, event?: { date: string; venue: string } | null): InviteView {
  const { text, ...content } = config.content
  const words = text[language]
  const fallback = text[other(language)]
  const merged = Object.fromEntries(TEXT_KEYS.map((k) => [k, words[k] || (BORROWED.includes(k) ? fallback[k] : '')])) as InviteText
  // The programme borrows every word from the other language when blank there.
  const alt = other(language)
  const timeline: PartView[] = content.timeline.map(({ text: partText, items, ...part }) => ({
    ...part,
    title: partText[language].title || partText[alt].title,
    place: partText[language].place || partText[alt].place,
    address: partText[language].address || partText[alt].address,
    items: items.map((m) => ({ time: m.time, title: m.text[language].title || m.text[alt].title })),
  }))
  return {
    ...content,
    ...merged,
    timeline,
    language,
    date: event?.date ?? '',
    venue: event?.venue ?? '',
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
