import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { authApi } from '@/api/endpoints'
import { onAuthExpired, tokens } from '@/api/http'
import type { ApiUser, ProfileUpdate } from '@/api/types'
import { adoptRecords, type Recorder } from '@/offline/transactionRepo'

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
  /** Who owns gifts recorded in this session; uploads match records by this id. */
  const recorder = computed<Recorder | null>(() => (user.value ? { id: user.value.id, username: user.value.username } : null))

  onAuthExpired(() => {
    sessionExpired.value = true
  })

  /** Store the user and tag this device's records with their id (and new name, after a rename). */
  async function setUser(me: ApiUser) {
    const previous = user.value?.id === me.id ? user.value.username : null
    user.value = me
    try {
      localStorage.setItem(USER_KEY, JSON.stringify(me))
    } catch {
      /* storage unavailable */
    }
    await adoptRecords(me, previous && previous !== me.username ? [previous] : [])
  }

  async function login(name: string, password: string) {
    await authApi.login(name, password)
    const me = await authApi.me()
    sessionExpired.value = false
    await setUser(me)
  }

  /** Tag this device's older records with the cached user's id, then pick up profile changes made elsewhere. */
  async function refresh() {
    if (!user.value) return
    await adoptRecords(user.value) // local only, so it also works offline
    try {
      await setUser(await authApi.me())
    } catch {
      /* offline or session expired: keep the cached user */
    }
  }

  async function updateProfile(update: ProfileUpdate) {
    await setUser(await authApi.updateMe(update))
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

  return { user, username, recorder, isLoggedIn, sessionExpired, login, refresh, updateProfile, logout }
})
