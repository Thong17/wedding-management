import type { InviteLanguage } from './config'

/**
 * Fixed words on the invitation itself. They follow the invite's language (chosen by the organizer),
 * not the language of whoever opens the app. The defaults also fill a blank greeting or title, so an
 * invitation looks complete before anything is written.
 */
const LABELS = {
  km: {
    tapToOpen: 'ចុចដើម្បីបើកលិខិតអញ្ជើញ',
    invitation: 'សិរីមង្គលអាពាហ៍ពិពាហ៍',
    defaultTitle: 'សិរីមង្គលអាពាហ៍ពិពាហ៍',
    greetingTitle: 'សូមគោរពអញ្ចើញ',
    honouredGuest: 'ភ្ញៀវកិត្តិយស',
    defaultGreeting: 'ឯកឧត្តម លោកជំទាវ លោក លោកស្រី អ្នកនាងកញ្ញា អញ្ជើញចូលរួមជាអធិបតី និងជាភ្ញៀវកិត្តិយស',
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
    preparing: 'កំពុងរៀបចំលិខិតអញ្ជើញ…',
    programme: 'កម្មវិធី',
    gift: 'ចំណងដៃ',
    countdownTitle: 'រាប់ថយក្រោយដល់ថ្ងៃមង្គល',
    countdownToday: 'ថ្ងៃនេះជាថ្ងៃមង្គលការរបស់យើង',
    days: 'ថ្ងៃ',
    hours: 'ម៉ោង',
    minutes: 'នាទី',
    seconds: 'វិនាទី',
    defaultMessage:
      'វត្តមានរបស់លោកអ្នក គឺជាកិត្តិយស និងសុភមង្គលដ៏ធំធេងសម្រាប់ក្រុមគ្រួសារយើងខ្ញុំ។',
    thanksTitle: 'លិខិតសូមថ្លែងអំណរគុណ',
    defaultThanks:
      'យើងខ្ញុំសូមថ្លែងអំណរគុណយ៉ាងជ្រាលជ្រៅចំពោះការអញ្ជើញចូលរួមជាអធិបតី និងជាភ្ញៀវកិត្តិយសក្នុងកម្មវិធីរបស់យើងខ្ញុំ។ យើងខ្ញុំសូមគោរពជូនពរដល់ភ្ញៀវកិត្តិយសទាំងអស់ សូមប្រកបតែសុខភាពល្អ មានជ័យជំនះគ្រប់ភារកិច្ច និងមានសុភមង្គលក្នុងក្រុមគ្រួសារជានិច្ចនិរន្តរ៍។',
    apologyTitle: 'លិខិតសូមអភ័យទោស',
    defaultApology:
      'យើងខ្ញុំសូមមេត្តាអធ្យាស្រ័យ និងអភ័យទោសពីសំណាក់ ឯកឧត្តម លោកជំទាវ អ្នកឧកញ៉ា ឧកញ៉ា លោក លោកស្រី អ្នកនាង កញ្ញា និងភ្ញៀវកិត្តិយសទាំងអស់ ដោយយើងខ្ញុំពុំបានគោរពជូនលិខិតអញ្ជើញដោយផ្ទាល់ៗ យើងខ្ញុំសង្ឃឹមថាភ្ញៀវកិត្តិយសទាំងអស់នឹងអញ្ជើញចូលរួមក្នុងកម្មវិធីរបស់យើងខ្ញុំជាក់ជាមិនខាន។',
    giftHint: 'ចុចលើកូដ QR ដើម្បីរក្សាទុក ហើយស្កេនក្នុងកម្មវិធីធនាគាររបស់អ្នក។',
    saveToDevice: 'រក្សាទុកក្នុងឧបករណ៍',
    saving: 'កំពុងរក្សាទុក…',
    saved: 'បានរក្សាទុក',
    checkName: 'មុនពេលផ្ញើ សូមប្រាកដថាឈ្មោះគណនីដែលបង្ហាញក្នុងកម្មវិធីធនាគាររបស់អ្នក គឺ «{name}»។',
    checkNameGeneric: 'មុនពេលផ្ញើ សូមពិនិត្យឈ្មោះគណនីដែលបង្ហាញក្នុងកម្មវិធីធនាគាររបស់អ្នកឲ្យបានត្រឹមត្រូវ។',
    soundOn: 'បើកសំឡេង',
    soundOff: 'បិទសំឡេង',
    switchLanguage: 'Switch to English',
    otherLanguage: 'EN',
    serviceMadeWith: 'លិខិតអញ្ជើញនេះបង្កើតដោយ 💝 Wedding Desk',
    serviceTitle: 'បង្កើតលិខិតអញ្ជើញឌីជីថលរបស់អ្នក',
    serviceText: 'លិខិតអញ្ជើញអាពាហ៍ពិពាហ៍ឌីជីថលដ៏ស្រស់ស្អាត មានកម្មវិធី ផែនទី QR ចំណងដៃ រូបថត និងតន្ត្រី ព្រមទាំងប្រព័ន្ធកត់ត្រាចំណងដៃនៅថ្ងៃមង្គលការ។',
    serviceFeatures: 'លិខិតអញ្ជើញឌីជីថល · ភាសាខ្មែរ និងអង់គ្លេស · កត់ត្រាចំណងដៃ',
    serviceContact: 'ទាក់ទងយើងតាម Telegram',
  },
  en: {
    tapToOpen: 'Tap to open the invitation',
    invitation: 'Wedding invitation',
    defaultTitle: 'The Wedding Celebration',
    greetingTitle: 'You are cordially invited',
    honouredGuest: 'Our honoured guest',
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
    preparing: 'Preparing your invitation…',
    programme: 'Programme',
    gift: 'Wedding gift',
    countdownTitle: 'Counting down to our big day',
    countdownToday: 'Today is our wedding day',
    days: 'Days',
    hours: 'Hours',
    minutes: 'Minutes',
    seconds: 'Seconds',
    defaultMessage:
      'Your presence would be the greatest gift as we begin our life together. We would be honoured to celebrate this special day with you.',
    thanksTitle: 'With our heartfelt thanks',
    defaultThanks:
      'We are deeply grateful to you for honouring our celebration as our guests of honour. We wish you all good health, success in all your endeavours, and lasting happiness for your families.',
    apologyTitle: 'With our apologies',
    defaultApology:
      'We kindly ask the forgiveness of all our distinguished guests for not delivering this invitation to you in person. We sincerely hope you will all be able to join us and share in our celebration.',
    giftHint: 'Tap a QR code to save it, then scan it in your banking app.',
    saveToDevice: 'Save to device',
    saving: 'Saving…',
    saved: 'Saved',
    checkName: 'Before sending, make sure the account name shown in your banking app is “{name}”.',
    checkNameGeneric: 'Before sending, check that the account name shown in your banking app is correct.',
    soundOn: 'Turn sound on',
    soundOff: 'Turn sound off',
    switchLanguage: 'ប្ដូរទៅភាសាខ្មែរ',
    otherLanguage: 'ខ្មែរ',
    serviceMadeWith: 'This invitation was made with 💝 Wedding Desk',
    serviceTitle: 'Create your own digital invitation',
    serviceText: 'Beautiful wedding e-invitations with your programme, maps, gift QR codes, photos and music, plus a gift desk to record every gift on the day.',
    serviceFeatures: 'Digital invitations · Khmer & English · Gift recording',
    serviceContact: 'Contact us on Telegram',
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
export const kmDigits = (n: number | string) => String(n).replace(/\d/g, (d) => KM_DIGITS[Number(d)])

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
