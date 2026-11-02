import { ref } from 'vue'

export type Theme = 'light' | 'dark' | 'blue' | 'pink'
export const THEMES: Theme[] = ['light', 'dark', 'blue', 'pink']

// Keep in sync with the inline script in index.html, which applies the theme before first paint.
const STORAGE_KEY = 'wms.theme'
/** Browser/OS bar color per theme (<meta name="theme-color">). */
const BAR_COLORS: Record<Theme, string> = { light: '#7a3b5c', dark: '#211b24', blue: '#1d5fbf', pink: '#c2185b' }
/** Swatch shown next to each theme in the switcher. */
export const SWATCHES: Record<Theme, { bg: string; accent: string }> = {
  light: { bg: '#faf7f8', accent: '#7a3b5c' },
  dark: { bg: '#17131a', accent: '#d987ad' },
  blue: { bg: '#f4f7fc', accent: '#1d5fbf' },
  pink: { bg: '#fdf5f8', accent: '#c2185b' },
}

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as Theme | null
    if (saved && THEMES.includes(saved)) return saved
  } catch {
    /* storage unavailable */
  }
  // Nothing chosen yet: follow the device's light/dark setting.
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export const theme = ref<Theme>(initialTheme())

function apply(t: Theme) {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = t
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BAR_COLORS[t])
}
apply(theme.value)

export function setTheme(t: Theme): void {
  theme.value = t
  apply(t)
  try {
    localStorage.setItem(STORAGE_KEY, t)
  } catch {
    /* storage unavailable */
  }
}
