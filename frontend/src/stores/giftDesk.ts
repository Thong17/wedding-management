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
  const giftedGuestIds = computed(() => new Set(counted.value.map((t) => t.guestId).filter((id) => id != null)))
  // Money only: item gifts have no amount.
  const localTotal = computed(() => counted.value.reduce((sum, t) => sum + (t.amount ? Number(t.amount) : 0), 0))

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
      await loadTransactions() // the list and totals are current once this resolves (also after a conflict)
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
      await loadTransactions()
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
