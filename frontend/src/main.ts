import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import { i18n } from './i18n'
import { requestPersistentStorage } from './offline/db'
import router from './router'
import { useAuthStore } from './stores/auth'
import { useSyncStore } from './stores/sync'
import './style.css'

const app = createApp(App)
app.use(i18n)
app.use(createPinia())
app.use(router)
app.mount('#app')

void requestPersistentStorage()
useSyncStore().start()
void useAuthStore().refresh()
