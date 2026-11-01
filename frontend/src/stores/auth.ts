import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { authApi } from '@/api/endpoints'
import { onAuthExpired, tokens } from '@/api/http'
import type { ApiUser } from '@/api/types'

const USER_KEY = 'wms.user'

function loadUser(): ApiUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? (JSON.parse(raw) as ApiUser) : null
  } catch {
    return null
  }
}

export const useAuthStore = defineStore('auth', () => {
  // The cached user keeps the app usable offline even if the access token has expired.
  const user = ref<ApiUser | null>(loadUser())
  const sessionExpired = ref(false)

  const isLoggedIn = computed(() => user.value !== null)
  const username = computed(() => user.value?.username ?? null)

  onAuthExpired(() => {
    sessionExpired.value = true
  })

  async function login(name: string, password: string) {
    await authApi.login(name, password)
    const me = await authApi.me()
    user.value = me
    sessionExpired.value = false
    try {
      localStorage.setItem(USER_KEY, JSON.stringify(me))
    } catch {
      /* storage unavailable */
    }
  }

  /** Clears credentials only. Locally stored gift transactions are never touched. */
  function logout() {
    tokens.clear()
    user.value = null
    sessionExpired.value = false
    try {
      localStorage.removeItem(USER_KEY)
    } catch {
      /* storage unavailable */
    }
  }

  return { user, username, isLoggedIn, sessionExpired, login, logout }
})
