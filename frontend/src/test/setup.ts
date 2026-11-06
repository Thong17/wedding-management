import 'fake-indexeddb/auto'
import { config } from '@vue/test-utils'
import { i18n, setLocale } from '@/i18n'

// Components use useI18n(), so every mounted test component gets the plugin; tests assert English text.
setLocale('en')
config.global.plugins = [...(config.global.plugins ?? []), i18n]

// jsdom has no ResizeObserver; Reka UI uses it to place tooltips and menus.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// jsdom has no canvas either; the invitation's particles and QR codes simply draw nothing.
HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext
