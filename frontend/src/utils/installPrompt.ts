import { computed, ref } from 'vue'

/**
 * "Install app": Chrome/Edge (Android and desktop) fire `beforeinstallprompt` once the app can be
 * installed; we keep that event and show it from the user menu instead of relying on the browser's
 * own hint, which is easy to miss. iPhones have no such event: there the menu explains
 * Share → Add to Home Screen.
 */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const deferred = ref<InstallPromptEvent | null>(null)
const installed = ref(
  typeof window !== 'undefined' &&
    (window.matchMedia?.('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true),
)

const isIos =
  typeof navigator !== 'undefined' &&
  (/iphone|ipad|ipod/i.test(navigator.userAgent) ||
    // iPadOS reports itself as a Mac with touch.
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))

/** Call once at startup, before the browser fires the event. */
export function listenForInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault() // keep it for our menu item
    deferred.value = e as InstallPromptEvent
  })
  window.addEventListener('appinstalled', () => {
    deferred.value = null
    installed.value = true
  })
}

export function useInstallPrompt() {
  const canPrompt = computed(() => !!deferred.value)
  /** iPhone/iPad in the browser: installing is done by hand from the Share menu. */
  const needsIosSteps = computed(() => isIos && !installed.value)

  /** Show the browser's install dialog. Returns true when the user installed. */
  async function install(): Promise<boolean> {
    const event = deferred.value
    if (!event) return false
    deferred.value = null // the event can be used only once
    await event.prompt()
    return (await event.userChoice).outcome === 'accepted'
  }

  return { canPrompt, needsIosSteps, install }
}
