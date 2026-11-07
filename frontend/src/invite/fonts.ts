import type { InviteFont } from './config'

/**
 * The invite's font pairings: one for the couple's names and headings, one for the text. Every stack
 * ends in a Khmer font, so Khmer names and messages render in a matching style too.
 *
 * The fonts ship with the app (Fontsource), are loaded only when an invite needs them, and are left out
 * of the gift desk's offline install (vite.config.ts). `loadFonts` resolves once they are ready, so the
 * invitation can wait instead of showing text in a fallback font first.
 */
export interface FontPairing {
  names: string
  text: string
  /**
   * For the English version of a Khmer pairing: Khmer fonts carry Latin letters too, but heavy ones
   * (Moul's look like a slab), so English words use these instead. Khmer letters still fall back to the
   * Khmer fonts later in the stack.
   */
  latin?: { names: string; text: string }
  /** Loads the pairing's font files (CSS with @font-face). */
  load: () => Promise<unknown>
  /** What document.fonts.load must have ready before the text is shown. */
  faces: string[]
}

const KHMER_TEXT = "'Suwannaphum'"
const SERIF = "Georgia, 'Times New Roman', serif"

export const FONT_PAIRINGS: Record<InviteFont, FontPairing> = {
  classic: {
    names: `'Playfair Display', 'Noto Serif Khmer', ${SERIF}`,
    text: `'Cormorant Garamond', ${KHMER_TEXT}, ${SERIF}`,
    load: () =>
      Promise.all([
        import('@fontsource/playfair-display/500.css'),
        import('@fontsource/playfair-display/500-italic.css'),
        import('@fontsource/cormorant-garamond/400.css'),
        import('@fontsource/cormorant-garamond/600.css'),
        import('@fontsource/noto-serif-khmer/600.css'),
        import('@fontsource/suwannaphum/400.css'),
        import('@fontsource/suwannaphum/700.css'),
      ]),
    faces: ["500 1em 'Playfair Display'", "400 1em 'Cormorant Garamond'"],
  },
  romantic: {
    names: `'Great Vibes', 'Moul', cursive`,
    text: `'Cormorant Garamond', ${KHMER_TEXT}, ${SERIF}`,
    load: () =>
      Promise.all([
        import('@fontsource/great-vibes/400.css'),
        import('@fontsource/moul/400.css'),
        import('@fontsource/cormorant-garamond/400.css'),
        import('@fontsource/cormorant-garamond/600.css'),
        import('@fontsource/suwannaphum/400.css'),
        import('@fontsource/suwannaphum/700.css'),
      ]),
    faces: ["400 1em 'Great Vibes'", "400 1em 'Cormorant Garamond'"],
  },
  modern: {
    names: `'Cormorant Garamond', 'Noto Serif Khmer', ${SERIF}`,
    text: `'Cormorant Garamond', ${KHMER_TEXT}, ${SERIF}`,
    load: () =>
      Promise.all([
        import('@fontsource/cormorant-garamond/400.css'),
        import('@fontsource/cormorant-garamond/600.css'),
        import('@fontsource/noto-serif-khmer/400.css'),
        import('@fontsource/suwannaphum/400.css'),
        import('@fontsource/suwannaphum/700.css'),
      ]),
    faces: ["600 1em 'Cormorant Garamond'"],
  },
  'khmer-royal': {
    names: `'Moul', 'Playfair Display', ${SERIF}`,
    text: `${KHMER_TEXT}, 'Cormorant Garamond', ${SERIF}`,
    latin: { names: `'Playfair Display', 'Moul', ${SERIF}`, text: `'Cormorant Garamond', ${KHMER_TEXT}, ${SERIF}` },
    load: () =>
      Promise.all([
        import('@fontsource/moul/400.css'),
        import('@fontsource/suwannaphum/400.css'),
        import('@fontsource/suwannaphum/700.css'),
        import('@fontsource/playfair-display/500.css'),
        import('@fontsource/cormorant-garamond/400.css'),
      ]),
    faces: ["400 1em 'Moul'", "400 1em 'Suwannaphum'"],
  },
  'khmer-elegant': {
    names: `'Noto Serif Khmer', 'Playfair Display', ${SERIF}`,
    text: `'Noto Serif Khmer', 'Cormorant Garamond', ${SERIF}`,
    latin: { names: `'Playfair Display', 'Noto Serif Khmer', ${SERIF}`, text: `'Cormorant Garamond', 'Noto Serif Khmer', ${SERIF}` },
    load: () =>
      Promise.all([
        import('@fontsource/noto-serif-khmer/400.css'),
        import('@fontsource/noto-serif-khmer/600.css'),
        import('@fontsource/playfair-display/500.css'),
        import('@fontsource/cormorant-garamond/400.css'),
      ]),
    faces: ["600 1em 'Noto Serif Khmer'", "400 1em 'Noto Serif Khmer'"],
  },
}

/**
 * Load a pairing and wait until its faces can be drawn (Khmer and Latin sample text, so both subsets
 * are fetched). Gives up after `timeoutMs`: the page then shows with whatever is ready, never stuck.
 */
export async function loadFonts(font: InviteFont, timeoutMs = 3000): Promise<void> {
  const pairing = FONT_PAIRINGS[font] ?? FONT_PAIRINGS.classic
  const ready = (async () => {
    await pairing.load()
    if (typeof document === 'undefined' || !document.fonts) return
    await Promise.all(pairing.faces.map((face) => document.fonts.load(face, 'Aa ក')))
  })()
  await Promise.race([ready.catch(() => undefined), new Promise((resolve) => setTimeout(resolve, timeoutMs))])
}
