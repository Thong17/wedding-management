import type { InviteLanguage } from './config'

/**
 * Fixed words on the invitation itself. They follow the invite's language (chosen by the organizer),
 * not the language of whoever opens the app. The defaults also fill a blank greeting or title, so an
 * invitation looks complete before anything is written.
 */
const LABELS = {
  km: {
    tapToOpen: 'ចុចដើម្បីបើកលិខិតអញ្ជើញ',
    invitation: 'លិខិតអញ្ជើញ',
    defaultTitle: 'សិរីមង្គលអាពាហ៍ពិពាហ៍',
    defaultGreeting: 'យើងខ្ញុំមានកិត្តិយសសូមគោរពអញ្ជើញ ឯកឧត្តម លោកជំទាវ លោក លោកស្រី អ្នកនាងកញ្ញា អញ្ជើញចូលរួមជាអធិបតី និងជាភ្ញៀវកិត្តិយស',
    and: 'និង',
    date: 'កាលបរិច្ឆេទ',
    time: 'វេលាម៉ោង',
    venue: 'ទីកន្លែង',
    directions: 'ផែនទី',
    scanForDirections: 'ស្កេនដើម្បីមើលផ្លូវ',
    openMaps: 'បើកក្នុង Google Maps',
    gallery: 'កម្រងរូបភាព',
    close: 'បិទ',
    notFoundTitle: 'រកមិនឃើញលិខិតអញ្ជើញ',
    notFoundText: 'តំណនេះមិនត្រឹមត្រូវ ឬលិខិតអញ្ជើញមិនទាន់ត្រូវបានចេញផ្សាយ។',
    errorTitle: 'មិនអាចបើកលិខិតអញ្ជើញបានទេ',
    errorText: 'សូមពិនិត្យការតភ្ជាប់អ៊ីនធឺណិត ហើយព្យាយាមម្ដងទៀត។',
    retry: 'ព្យាយាមម្ដងទៀត',
  },
  en: {
    tapToOpen: 'Tap to open the invitation',
    invitation: 'Wedding invitation',
    defaultTitle: 'The Wedding Celebration',
    defaultGreeting: 'Together with their families, request the pleasure of your company at their wedding',
    and: '&',
    date: 'Date',
    time: 'Time',
    venue: 'Venue',
    directions: 'Directions',
    scanForDirections: 'Scan for directions',
    openMaps: 'Open in Google Maps',
    gallery: 'Gallery',
    close: 'Close',
    notFoundTitle: 'Invitation not found',
    notFoundText: 'This link is not valid, or the invitation has not been published yet.',
    errorTitle: 'The invitation could not be opened',
    errorText: 'Please check your connection and try again.',
    retry: 'Try again',
  },
} as const

export type InviteLabels = Record<keyof (typeof LABELS)['en'], string>

export function inviteLabels(language: InviteLanguage): InviteLabels {
  return LABELS[language] ?? LABELS.en
}

// Khmer dates are written out here rather than with Intl: many browsers ship without Khmer date data
// and would fall back to English.
const KM_DIGITS = '០១២៣៤៥៦៧៨៩'
const KM_WEEKDAYS = ['អាទិត្យ', 'ច័ន្ទ', 'អង្គារ', 'ពុធ', 'ព្រហស្បតិ៍', 'សុក្រ', 'សៅរ៍']
const KM_MONTHS = ['មករា', 'កុម្ភៈ', 'មីនា', 'មេសា', 'ឧសភា', 'មិថុនា', 'កក្កដា', 'សីហា', 'កញ្ញា', 'តុលា', 'វិច្ឆិកា', 'ធ្នូ']
const kmDigits = (n: number | string) => String(n).replace(/\d/g, (d) => KM_DIGITS[Number(d)])

/** "Saturday, 12 December 2026", or "ថ្ងៃសៅរ៍ ទី១២ ខែធ្នូ ឆ្នាំ២០២៦". */
export function formatInviteDate(iso: string, language: InviteLanguage): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  if (Number.isNaN(date.getTime())) return iso
  if (language === 'km') return `ថ្ងៃ${KM_WEEKDAYS[date.getDay()]} ទី${kmDigits(d)} ខែ${KM_MONTHS[m - 1]} ឆ្នាំ${kmDigits(y)}`
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(date)
}

/** "17:30" → "5:30 PM", or "ម៉ោង ៥:៣០ ល្ងាច". */
export function formatInviteTime(hhmm: string, language: InviteLanguage): string {
  if (!hhmm) return ''
  const [h, m] = hhmm.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm
  if (language === 'km') {
    const part = h < 12 ? 'ព្រឹក' : h < 17 ? 'រសៀល' : h < 19 ? 'ល្ងាច' : 'យប់'
    return `ម៉ោង ${kmDigits(((h + 11) % 12) + 1)}:${kmDigits(String(m).padStart(2, '0'))} ${part}`
  }
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(2000, 0, 1, h, m))
}
