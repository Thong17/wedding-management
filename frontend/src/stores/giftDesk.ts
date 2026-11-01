import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { errorMessage } from '@/api/http'
import { onTransactionsChanged } from '@/offline/changes'
import { getDeviceId, type CachedGuest, type GiftTransaction } from '@/offline/db'
import { getCachedGuests, getGuestCacheTime, refreshGuestCache } from '@/offline/guestCache'
import { createGuestSearcher, type GuestSearcher } from '@/offline/guestSearch'
import { addTransaction, listTransactions, type GiftInput } from '@/offline/transactionRepo'
import { useAuthStore } from './auth'
import { useSyncStore } from './sync'

export const useGiftDeskStore = defineStore('giftDesk', () => {
  const eventId = ref<number | null>(null)
  const guests = shallowRef<CachedGuest[]>([])
  const searcher = shallowRef<GuestSearcher>(createGuestSearcher([]))
  const transactions = ref<GiftTransaction[]>([])
  const guestsCachedAt = ref<string | null>(null)
  const guestRefreshError = ref<string | null>(null)
  const refreshingGuests = ref(false)

  const giftedGuestIds = computed(() => new Set(transactions.value.map((t) => t.guestId).filter((id) => id != null)))
  const localTotal = computed(() => transactions.value.reduce((sum, t) => sum + Number(t.amount), 0))

  let unsubscribe: (() => void) | null = null

  async function loadLocal() {
    if (eventId.value == null) return
    guests.value = await getCachedGuests(eventId.value)
    searcher.value = createGuestSearcher(guests.value)
    guestsCachedAt.value = await getGuestCacheTime(eventId.value)
    await loadTransactions()
  }

  async function loadTransactions() {
    if (eventId.value == null) return
    transactions.value = await listTransactions({ eventId: eventId.value })
  }

  /** Open the desk for an event: show cached data immediately, then refresh guests if online. */
  async function open(id: number) {
    eventId.value = id
    guestRefreshError.value = null
    unsubscribe?.()
    unsubscribe = onTransactionsChanged(() => void loadTransactions())
    await loadLocal()
    await refreshGuests()
  }

  async function refreshGuests(full = false) {
    if (eventId.value == null) return
    refreshingGuests.value = true
    try {
      await refreshGuestCache(eventId.value, { full })
      guestRefreshError.value = null
      await loadLocal()
    } catch (err) {
      guestRefreshError.value = guests.value.length
        ? `Using saved guest list (${errorMessage(err)})`
        : `Guest list not available offline yet: ${errorMessage(err)}`
    } finally {
      refreshingGuests.value = false
    }
  }

  /** Record a gift locally; resolves once IndexedDB has committed it. Upload happens in the background. */
  async function recordGift(input: Omit<GiftInput, 'eventId'>): Promise<GiftTransaction> {
    if (eventId.value == null) throw new Error('No event open.')
    const auth = useAuthStore()
    if (!auth.username) throw new Error('Not logged in.')
    const record = await addTransaction(
      { ...input, eventId: eventId.value },
      { deviceId: await getDeviceId(), recordedBy: auth.username },
    )
    transactions.value = [record, ...transactions.value]
    void useSyncStore().syncSoon()
    return record
  }

  function close() {
    unsubscribe?.()
    unsubscribe = null
  }

  return {
    eventId,
    guests,
    searcher,
    transactions,
    guestsCachedAt,
    guestRefreshError,
    refreshingGuests,
    giftedGuestIds,
    localTotal,
    open,
    close,
    refreshGuests,
    recordGift,
    loadTransactions,
  }
})
