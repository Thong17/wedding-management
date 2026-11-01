import { defineStore } from 'pinia'
import { ref } from 'vue'
import { eventsApi } from '@/api/endpoints'
import { errorMessage } from '@/api/http'
import type { ApiEvent } from '@/api/types'
import type { CachedEvent } from '@/offline/db'
import { cacheEvent, cacheEvents, getCachedEvent, getCachedEvents } from '@/offline/guestCache'

export const useEventsStore = defineStore('events', () => {
  const events = ref<(ApiEvent | CachedEvent)[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  /** True when the list shown came from the offline cache. */
  const fromCache = ref(false)

  async function load() {
    loading.value = true
    error.value = null
    try {
      const list = await eventsApi.list()
      events.value = list
      fromCache.value = false
      await cacheEvents(list)
    } catch (err) {
      const cached = await getCachedEvents()
      events.value = cached.sort((a, b) => b.date.localeCompare(a.date))
      fromCache.value = true
      if (!cached.length) error.value = errorMessage(err)
    } finally {
      loading.value = false
    }
  }

  /** Online copy if reachable, otherwise the cached one. */
  async function getEvent(id: number): Promise<{ event: ApiEvent | CachedEvent | null; fromCache: boolean }> {
    try {
      const event = await eventsApi.get(id)
      await cacheEvent(event)
      return { event, fromCache: false }
    } catch {
      return { event: (await getCachedEvent(id)) ?? null, fromCache: true }
    }
  }

  return { events, loading, error, fromCache, load, getEvent }
})
