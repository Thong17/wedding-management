import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import { i18n } from './i18n'
import { requestPersistentStorage } from './offline/db'
import router from './router'
import { useAuthStore } from './stores/auth'
import { useSyncStore } from './stores/sync'
import { listenForInstallPrompt } from './utils/installPrompt'
import './style.css'

// Before mounting: the browser may offer installing the app as soon as the page loads.
listenForInstallPrompt()

// After a new release, a page loaded earlier may ask for code files that no longer exist (their names
// change with every build) and would sit on a blank or loading screen. Reload once to get the new ones;
// the marker stops a reload loop if the files are really unreachable.
const RELOADED_KEY = 'wms.reloadedFor'
function reloadOnce(path: string): boolean {
  try {
    if (sessionStorage.getItem(RELOADED_KEY) === path) return false
    sessionStorage.setItem(RELOADED_KEY, path)
  } catch {
    return false
  }
  location.assign(path)
  return true
}
const isMissingCode = (err: unknown) =>
  /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload/i.test(
    String((err as Error)?.message ?? err),
  )
router.onError((err, to) => {
  if (isMissingCode(err)) reloadOnce(to.fullPath)
})
window.addEventListener('vite:preloadError', (event) => {
  if (reloadOnce(location.pathname + location.search)) event.preventDefault()
})
router.afterEach(() => {
  try {
    sessionStorage.removeItem(RELOADED_KEY)
  } catch {
    // storage blocked: nothing to clear
  }
})

const app = createApp(App)
app.use(i18n)
app.use(createPinia())
app.use(router)
app.mount('#app')

void requestPersistentStorage()
useSyncStore().start()
void useAuthStore().refresh()
