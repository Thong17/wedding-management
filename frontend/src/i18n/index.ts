import { createI18n } from 'vue-i18n'
import en from './en'
import km from './km'

export type Locale = 'en' | 'km'
export const LOCALES: Locale[] = ['en', 'km']

const STORAGE_KEY = 'wms.locale'

function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'en' || saved === 'km') return saved
  } catch {
    /* storage unavailable */
  }
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('km') ? 'km' : 'en'
}

const messages: Record<Locale, typeof en> = { en, km }

export const i18n = createI18n({
  legacy: false,
  locale: initialLocale(),
  fallbackLocale: 'en',
  messages,
})

/** Translate outside components (stores, offline layer, utils). */
export const t = i18n.global.t

export function currentLocale(): Locale {
  return i18n.global.locale.value
}

/** BCP 47 tag for Intl formatting (money, dates) and the date picker. */
export function intlLocale(locale: Locale = currentLocale()): string {
  if (locale === 'km') return 'km-KH'
  // Keep the device's English variant (en-GB dates etc.) when it has one.
  const device = typeof navigator !== 'undefined' ? navigator.language : ''
  return device?.toLowerCase().startsWith('en') ? device : 'en-US'
}

export function setLocale(locale: Locale): void {
  i18n.global.locale.value = locale
  applyDocumentLang(locale)
  try {
    localStorage.setItem(STORAGE_KEY, locale)
  } catch {
    /* storage unavailable */
  }
}

function applyDocumentLang(locale: Locale) {
  if (typeof document !== 'undefined') document.documentElement.lang = locale
}
applyDocumentLang(currentLocale())
