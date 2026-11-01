import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import { requestPersistentStorage } from './offline/db'
import router from './router'
import { useSyncStore } from './stores/sync'
import './style.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')

void requestPersistentStorage()
useSyncStore().start()
