import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { giftsApi } from '@/api/endpoints'
import { startAutoSync } from '@/offline/autoSync'
import { onTransactionsChanged } from '@/offline/changes'
import { SyncEngine, type SyncSnapshot } from '@/offline/syncEngine'
import { countByStatus, type StatusCounts } from '@/offline/transactionRepo'
import { useAuthStore } from './auth'

export const useSyncStore = defineStore('sync', () => {
  const auth = useAuthStore()
  const counts = ref<StatusCounts>({ pending: 0, syncing: 0, synced: 0, failed: 0 })
  const snapshot = ref<SyncSnapshot>({ state: 'idle', lastSyncAt: null, lastError: null })
  const browserOnline = ref(typeof navigator === 'undefined' ? true : navigator.onLine)

  const engine = new SyncEngine({
    send: giftsApi.sync,
    currentUser: () => auth.username,
    isOnline: () => navigator.onLine,
  })
  engine.subscribe((s) => (snapshot.value = s))

  const unsynced = computed(() => counts.value.pending + counts.value.syncing)
  const state = computed(() => (auth.sessionExpired ? 'auth-required' : snapshot.value.state))

  async function refreshCounts() {
    counts.value = await countByStatus()
  }

  let stopAuto: (() => void) | null = null
  let started = false

  function start() {
    if (started) return
    started = true
    void refreshCounts()
    onTransactionsChanged(() => void refreshCounts())
    window.addEventListener('online', () => (browserOnline.value = true))
    window.addEventListener('offline', () => (browserOnline.value = false))
    stopAuto = startAutoSync(engine, { hasPending: async () => (await countByStatus()).pending > 0 })
    // Resume uploading as soon as the user logs back in.
    watch(
      () => [auth.username, auth.sessionExpired] as const,
      ([name, expired]) => {
        if (name && !expired) {
          engine.resumeAfterAuth()
          void engine.sync()
        }
      },
    )
  }

  function stop() {
    stopAuto?.()
    stopAuto = null
    started = false
  }

  const syncNow = () => engine.sync({ force: true })
  const syncSoon = () => engine.sync()

  return { counts, snapshot, state, unsynced, browserOnline, start, stop, syncNow, syncSoon, refreshCounts, engine }
})
