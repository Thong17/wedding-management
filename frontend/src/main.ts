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

const app = createApp(App)
app.use(i18n)
app.use(createPinia())
app.use(router)
app.mount('#app')

void requestPersistentStorage()
useSyncStore().start()
void useAuthStore().refresh()
