import axios from 'axios'
import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { giftsApi } from '@/api/endpoints'
import { errorMessage } from '@/api/http'
import type { ApiGift } from '@/api/types'
import { t } from '@/i18n'
import { onTransactionsChanged } from '@/offline/changes'
import { getDeviceId, type CachedGuest, type GiftTransaction } from '@/offline/db'
import { getCachedGuests, getGuestCacheTime, refreshGuestCache } from '@/offline/guestCache'
import { createGuestSearcher, type GuestSearcher } from '@/offline/guestSearch'
import {
  addTransaction,
  applyServerGift,
  deleteUnsyncedTransaction,
  GiftValidationError,
  isUnsynced,
  listTransactions,
  normalizeAmount,
  updateUnsyncedTransaction,
  validateGiftInput,
  type GiftInput,
} from '@/offline/transactionRepo'
import { formatGiftValue } from '@/utils/format'
import { useAuthStore } from './auth'
import { useSyncStore } from './sync'

const RECENT_LIMIT = 30

/** A gift from the server shown like this device's records (synced; recorded on any desk). */
function fromApiGift(g: ApiGift): GiftTransaction {
  return {
    txnId: g.client_txn_id,
    eventId: g.event,
    guestId: g.guest,
    walkInName: g.walk_in_name,
    guestNameSnapshot: g.guest_name || g.walk_in_name,
    amount: g.amount,
    item: g.item,
    currency: g.currency,
    method: g.method,
    note: g.note,
    createdAt: g.client_created_at,
    deviceId: '',
    recordedBy: g.recorded_by_username,
    recordedById: null,
    status: 'synced',
    attempts: 0,
    nextAttemptAt: 0,
    syncStartedAt: null,
    lastError: null,
    errorCode: null,
    errorDetails: null,
    serverGiftId: g.id,
    syncedAt: g.received_at,
    voided: g.voided,
    updatedAt: 0,
  }
}

export const useGiftDeskStore = defineStore('giftDesk', () => {
  const eventId = ref<number | null>(null)
  const guests = shallowRef<CachedGuest[]>([])
  const searcher = shallowRef<GuestSearcher>(createGuestSearcher([]))
  const transactions = ref<GiftTransaction[]>([])
  const guestsCachedAt = ref<string | null>(null)
  const guestRefreshError = ref<string | null>(null)
  const refreshingGuests = ref(false)

  // Gifts voided on the server stay listed (crossed out) but count for nothing.
  const counted = computed(() => transactions.value.filter((t) => !t.voided))
  // Money only: item gifts have no amount.
  const localTotal = computed(() => counted.value.reduce((sum, t) => sum + (t.amount ? Number(t.amount) : 0), 0))

  // What every desk on this event shares, from the server: gifts per guest (so desks see guests
  // already marked elsewhere) and the latest gifts with who recorded them. Refreshed while the desk is
  // open and online; the last copy is kept on this device for offline use. null until known.
  const serverMarks = shallowRef<Map<number, number> | null>(null)
  const serverRecent = shallowRef<ApiGift[]>([])
  const feedKey = (id: number) => `wms.deskFeed.${id}`
  function readSavedFeed(id: number) {
    try {
      const saved = localStorage.getItem(feedKey(id))
      if (!saved) return
      const { marks, recent } = JSON.parse(saved) as { marks: [number, number][]; recent: ApiGift[] }
      serverMarks.value = new Map(marks)
      serverRecent.value = recent
    } catch {
      // nothing saved, or unreadable: wait for the server
    }
  }
  async function refreshFeed() {
    const id = eventId.value
    if (id == null || !navigator.onLine) return
    try {
      const feed = await giftsApi.deskFeed(id)
      if (eventId.value !== id) return // switched events meanwhile
      const marks = feed.marks.map((m) => [m.guest, m.count] as [number, number])
      serverMarks.value = new Map(marks)
      serverRecent.value = feed.recent
      try {
        localStorage.setItem(feedKey(id), JSON.stringify({ marks, recent: feed.recent }))
      } catch {
        // storage full or blocked: still shown now
      }
    } catch {
      // offline or server unreachable: keep showing the last known feed
    }
  }

  /**
   * Recent gifts from every desk, newest first: this device's records (with their upload status) and
   * the server's latest. For gifts on the server, the server's copy wins, as it has corrections and
   * voids made from other desks.
   */
  const recentGifts = computed(() => {
    const fromServer = new Map(serverRecent.value.map((g) => [g.client_txn_id, fromApiGift(g)]))
    const merged = transactions.value.map((t) => (t.status === 'synced' && fromServer.get(t.txnId)) || t)
    const local = new Set(transactions.value.map((t) => t.txnId))
    for (const [txnId, g] of fromServer) if (!local.has(txnId)) merged.push(g)
    return merged.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, RECENT_LIMIT)
  })

  /**
   * Gifts recorded for a guest on any desk: the server's count plus this device's gifts not uploaded
   * yet. Never less than what this device itself recorded (the server copy may be a little behind).
   */
  function giftCountFor(guestId: number): number {
    const mine = counted.value.filter((t) => t.guestId === guestId)
    const notOnServerYet = mine.filter((t) => t.status !== 'synced').length
    return Math.max((serverMarks.value?.get(guestId) ?? 0) + notOnServerYet, mine.length)
  }
  const giftedGuestIds = computed(() => {
    const ids = new Set<number | null>(counted.value.map((t) => t.guestId).filter((id) => id != null))
    for (const id of serverMarks.value?.keys() ?? []) ids.add(id)
    return ids
  })

  const FEED_REFRESH_MS = 20_000
  let feedTimer: ReturnType<typeof setInterval> | undefined
  const onOnline = () => void refreshFeed()

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
    serverMarks.value = null
    serverRecent.value = []
    readSavedFeed(id)
    clearInterval(feedTimer)
    feedTimer = setInterval(() => void refreshFeed(), FEED_REFRESH_MS)
    window.addEventListener('online', onOnline)
    await loadLocal()
    await Promise.all([refreshGuests(), refreshFeed()])
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
        ? t('desk.usingSaved', { error: errorMessage(err) })
        : t('desk.notOffline', { error: errorMessage(err) })
    } finally {
      refreshingGuests.value = false
    }
  }

  /** Record a gift locally; resolves once IndexedDB has committed it. Upload happens in the background. */
  async function recordGift(input: Omit<GiftInput, 'eventId'>): Promise<GiftTransaction> {
    if (eventId.value == null) throw new Error(t('desk.noEvent'))
    const auth = useAuthStore()
    if (!auth.recorder) throw new Error(t('desk.notLoggedIn'))
    const record = await addTransaction(
      { ...input, eventId: eventId.value },
      { deviceId: await getDeviceId(), recordedBy: auth.recorder },
    )
    transactions.value = [record, ...transactions.value]
    void useSyncStore().syncSoon()
    return record
  }

  /**
   * Correct a recorded gift. Not uploaded yet: changed on this device, then uploaded with the new values.
   * Already on the server: corrected there (needs the gift_edit permission and a connection), then
   * mirrored here. Guest and walk-in name stay as recorded.
   */
  async function editGift(txn: GiftTransaction, change: Pick<GiftInput, 'amount' | 'method' | 'item' | 'note'>) {
    const input = { guestId: txn.guestId, guestName: txn.guestNameSnapshot, walkInName: txn.walkInName, ...change }
    const errors = validateGiftInput({ ...input, eventId: txn.eventId, currency: txn.currency })
    if (Object.keys(errors).length) throw new GiftValidationError(errors)
    try {
      if (isUnsynced(txn)) {
        await updateUnsyncedTransaction(txn.txnId, input)
        void useSyncStore().syncSoon()
        return
      }
      await onServer(txn, async (gift) => {
        const amount = change.method === 'item' ? null : normalizeAmount(change.amount ?? '')
        return giftsApi.update(gift.event, gift.id, {
          amount,
          method: change.method,
          item: change.method === 'item' ? (change.item ?? '').trim() : '',
          note: (change.note ?? '').trim(),
          updated_at: gift.updated_at,
        })
      })
    } finally {
      // The list and totals are current once this resolves (also after a conflict); the feed too, for
      // gifts recorded on other desks.
      await Promise.all([loadTransactions(), refreshFeed()])
    }
  }

  /**
   * Remove a recorded gift. Not uploaded yet: deleted from this device (it never reaches the server).
   * Already on the server: voided there, the same as on the event's Gifts tab, so it stays on record
   * but leaves every total.
   */
  async function deleteGift(txn: GiftTransaction) {
    try {
      if (isUnsynced(txn)) await deleteUnsyncedTransaction(txn.txnId)
      else await onServer(txn, (gift) => giftsApi.void(gift.event, gift.id, gift.updated_at))
    } finally {
      await Promise.all([loadTransactions(), refreshFeed()])
    }
  }

  /** Change a synced gift on the server, then copy the server's result onto this device's record. */
  async function onServer(txn: GiftTransaction, change: (gift: ApiGift) => Promise<ApiGift>) {
    if (txn.serverGiftId == null || eventId.value == null) throw new Error(t('txn.notEditable'))
    let current: ApiGift
    try {
      current = await giftsApi.get(eventId.value, txn.serverGiftId)
    } catch (err) {
      // The server lists only gifts that aren't voided: gone there means voided by someone else.
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        await applyServerGift(txn.txnId, { ...txn, item: txn.item ?? '', voided: true })
        return
      }
      throw err
    }
    try {
      await applyServerGift(txn.txnId, await change(current))
    } catch (err) {
      // Someone changed it meanwhile: show their version here and say so, instead of overwriting it.
      const latest = axios.isAxiosError(err) && err.response?.status === 409 ? (err.response.data as { current?: ApiGift }).current : undefined
      if (latest) {
        await applyServerGift(txn.txnId, latest)
        throw new Error(t('gifts.conflict', { amount: formatGiftValue(latest) }))
      }
      throw err
    }
  }

  function close() {
    unsubscribe?.()
    unsubscribe = null
    clearInterval(feedTimer)
    window.removeEventListener('online', onOnline)
  }

  return {
    eventId,
    guests,
    searcher,
    transactions,
    guestsCachedAt,
    guestRefreshError,
    refreshingGuests,
    counted,
    serverMarks,
    giftCountFor,
    refreshFeed,
    recentGifts,
    giftedGuestIds,
    localTotal,
    open,
    close,
    refreshGuests,
    recordGift,
    editGift,
    deleteGift,
    loadTransactions,
  }
})
