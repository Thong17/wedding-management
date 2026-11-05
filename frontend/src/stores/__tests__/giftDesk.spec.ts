import { http as mswHttp, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { createPinia, setActivePinia } from 'pinia'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { API_URL, tokens } from '@/api/http'
import { getDB } from '@/offline/db'
import { claimBatch, GiftValidationError, listTransactions, markSynced } from '@/offline/transactionRepo'
import { useGiftDeskStore } from '@/stores/giftDesk'
import { useSyncStore } from '@/stores/sync'
import { DEMO_USER, resetDB, simulateReload } from '@/test/helpers'

// The backend is unreachable for the whole file.
const server = setupServer(mswHttp.all(`${API_URL}/*`, () => HttpResponse.error()))

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterAll(() => server.close())
afterEach(() => server.resetHandlers())
beforeEach(async () => {
  await resetDB()
  localStorage.setItem('wms.user', JSON.stringify({ id: 1, username: 'demo', first_name: '', last_name: '' }))
  tokens.set('a', 'r')
  setActivePinia(createPinia())
  // Pre-cache a guest list as if it had been loaded online earlier.
  const db = await getDB()
  await db.put('guests', {
    eventId: 1, id: 10, full_name: 'Sokha Chan', nickname: '', phone: '', side: 'bride', group: '', table_no: '',
    qr_token: '00000000-0000-4000-8000-000000000010', updated_at: '',
  })
})

describe('gift desk while offline', () => {
  it('uses the cached guest list and records gifts locally without waiting for the server', async () => {
    const desk = useGiftDeskStore()
    await desk.open(1)
    expect(desk.guests.map((g) => g.full_name)).toEqual(['Sokha Chan'])
    expect(desk.guestRefreshError).toMatch(/Using saved guest list/)

    const record = await desk.recordGift({
      guestId: 10, guestName: 'Sokha Chan', amount: '25', currency: 'USD', method: 'cash', note: '',
    })
    expect(record.status).toBe('pending')
    expect(desk.transactions[0].txnId).toBe(record.txnId)
    expect(desk.localTotal).toBe(25)

    // The background sync attempt fails; the gift must still be there afterwards.
    await useSyncStore().engine.sync()
    await simulateReload()
    const [stored] = await listTransactions({ eventId: 1 })
    expect(stored).toMatchObject({ txnId: record.txnId, status: 'pending', amount: '25.00', recordedBy: 'demo' })
  })
})

describe('correcting and removing recorded gifts', () => {
  const record = (desk: ReturnType<typeof useGiftDeskStore>) =>
    desk.recordGift({ guestId: 10, guestName: 'Sokha Chan', amount: '25', currency: 'USD', method: 'cash', note: '' })

  /** Record a gift and pretend the server accepted it as gift #7. */
  async function syncedGift(desk: ReturnType<typeof useGiftDeskStore>) {
    const rec = await record(desk)
    await claimBatch(1, { user: DEMO_USER })
    await markSynced(rec.txnId, 7)
    await desk.loadTransactions()
    return desk.transactions[0]
  }

  const serverGift = (over: Record<string, unknown> = {}) => ({
    id: 7, client_txn_id: 'x', event: 1, guest: 10, guest_name: 'Sokha Chan', walk_in_name: '', amount: '25.00',
    currency: 'USD', method: 'cash', item: '', note: '', client_created_at: '', recorded_by_username: 'demo',
    received_at: '', updated_at: '2026-11-04T10:00:00Z', voided: false, ...over,
  })

  it('changes or deletes a gift on this device while it is not uploaded yet', async () => {
    const desk = useGiftDeskStore()
    await desk.open(1)
    const rec = await record(desk)
    await desk.editGift(rec, { amount: '40', method: 'transfer', item: '', note: 'fixed' })
    expect(desk.transactions[0]).toMatchObject({ amount: '40.00', method: 'transfer', note: 'fixed' })
    // The edit asks for an upload right away; with no server here it goes back to waiting.
    await vi.waitFor(async () => {
      await desk.loadTransactions()
      expect(desk.transactions[0].status).toBe('pending')
    })
    expect(desk.localTotal).toBe(40)
    await expect(desk.editGift(desk.transactions[0], { amount: '0', method: 'cash', item: '', note: '' })).rejects.toBeInstanceOf(GiftValidationError)

    await desk.deleteGift(desk.transactions[0])
    expect(desk.transactions).toHaveLength(0)
  })

  it('corrects a synced gift on the server and mirrors the result', async () => {
    let sent: Record<string, unknown> = {}
    server.use(
      mswHttp.get(`${API_URL}/events/1/gifts/7/`, () => HttpResponse.json(serverGift())),
      mswHttp.patch(`${API_URL}/events/1/gifts/7/`, async ({ request }) => {
        sent = (await request.json()) as Record<string, unknown>
        return HttpResponse.json(serverGift({ amount: '30.00', note: 'fixed', updated_at: '2026-11-04T10:05:00Z' }))
      }),
    )
    const desk = useGiftDeskStore()
    await desk.open(1)
    const gift = await syncedGift(desk)
    await desk.editGift(gift, { amount: '30', method: 'cash', item: '', note: 'fixed' })
    expect(sent).toMatchObject({ amount: '30.00', note: 'fixed', updated_at: '2026-11-04T10:00:00Z' })
    expect(desk.transactions[0]).toMatchObject({ amount: '30.00', note: 'fixed', status: 'synced' })
  })

  it("shows someone else's newer change instead of overwriting it", async () => {
    server.use(
      mswHttp.get(`${API_URL}/events/1/gifts/7/`, () => HttpResponse.json(serverGift())),
      mswHttp.patch(`${API_URL}/events/1/gifts/7/`, () =>
        HttpResponse.json({ detail: 'changed', current: serverGift({ amount: '99.00' }) }, { status: 409 }),
      ),
    )
    const desk = useGiftDeskStore()
    await desk.open(1)
    const gift = await syncedGift(desk)
    await expect(desk.editGift(gift, { amount: '30', method: 'cash', item: '', note: '' })).rejects.toThrow(/Someone else/)
    expect(desk.transactions[0].amount).toBe('99.00')
  })

  it('voids a synced gift: still listed, no longer counted', async () => {
    server.use(
      mswHttp.get(`${API_URL}/events/1/gifts/7/`, () => HttpResponse.json(serverGift())),
      mswHttp.post(`${API_URL}/events/1/gifts/7/void/`, () => HttpResponse.json(serverGift({ voided: true }))),
    )
    const desk = useGiftDeskStore()
    await desk.open(1)
    const gift = await syncedGift(desk)
    expect(desk.localTotal).toBe(25)
    await desk.deleteGift(gift)
    expect(desk.transactions).toHaveLength(1)
    expect(desk.transactions[0].voided).toBe(true)
    expect(desk.localTotal).toBe(0)
    expect(desk.giftedGuestIds.has(10)).toBe(false)
  })
})

describe('guests marked on other desks', () => {
  it('shows guests that already have gifts on the server, from any desk', async () => {
    server.use(mswHttp.get(`${API_URL}/events/1/desk-feed/`, () => HttpResponse.json({ marks: [{ guest: 10, count: 2 }], recent: [] })))
    const desk = useGiftDeskStore()
    await desk.open(1)
    expect(desk.giftedGuestIds.has(10)).toBe(true) // recorded elsewhere: nothing on this device
    expect(desk.giftCountFor(10)).toBe(2)

    // A gift recorded here and not uploaded yet adds to the server's count.
    await desk.recordGift({ guestId: 10, guestName: 'Sokha Chan', amount: '5', currency: 'USD', method: 'cash', note: '' })
    expect(desk.giftCountFor(10)).toBe(3)
    desk.close()
  })

  it('keeps the last known marks for offline use', async () => {
    server.use(mswHttp.get(`${API_URL}/events/1/desk-feed/`, () => HttpResponse.json({ marks: [{ guest: 10, count: 1 }], recent: [] })))
    const first = useGiftDeskStore()
    await first.open(1)
    first.close()

    server.resetHandlers() // the server is unreachable again
    setActivePinia(createPinia())
    const later = useGiftDeskStore()
    await later.open(1)
    expect(later.giftedGuestIds.has(10)).toBe(true)
    later.close()
  })
})

describe('recent gifts from every desk', () => {
  const apiGift = (over: Record<string, unknown>) => ({
    id: 1, client_txn_id: 'x', event: 1, guest: 10, guest_name: 'Sokha Chan', walk_in_name: '', amount: '20.00',
    currency: 'USD', method: 'cash', item: '', note: '', client_created_at: '2026-11-04T09:00:00Z',
    recorded_by_username: 'dara', received_at: '', updated_at: '', voided: false, ...over,
  })

  it("merges other desks' gifts with this device's, the server's copy winning once synced", async () => {
    const desk = useGiftDeskStore()
    await desk.open(1)
    const mine = await desk.recordGift({ guestId: 10, guestName: 'Sokha Chan', amount: '25', currency: 'USD', method: 'cash', note: '' })
    const uploaded = await desk.recordGift({ guestId: 10, guestName: 'Sokha Chan', amount: '30', currency: 'USD', method: 'cash', note: '' })
    await vi.waitFor(async () => {
      await desk.loadTransactions()
      expect(desk.transactions.every((t) => t.status === 'pending')).toBe(true)
    })
    await claimBatch(10, { user: DEMO_USER }).then((claimed) =>
      Promise.all(claimed.filter((t) => t.txnId === uploaded.txnId).map((t) => markSynced(t.txnId, 7))),
    )

    server.use(
      mswHttp.get(`${API_URL}/events/1/desk-feed/`, () =>
        HttpResponse.json({
          marks: [],
          recent: [
            // Another desk's gift, recorded long after ours.
            apiGift({ id: 9, client_txn_id: 'other-desk', client_created_at: '2099-01-01T00:00:00Z', recorded_by_username: 'dara' }),
            // Our uploaded gift, corrected on the server since.
            apiGift({ id: 7, client_txn_id: uploaded.txnId, amount: '35.00', client_created_at: uploaded.createdAt, recorded_by_username: 'demo' }),
          ],
        }),
      ),
    )
    await desk.refreshFeed()
    await desk.loadTransactions()

    const list = desk.recentGifts
    expect(list[0]).toMatchObject({ txnId: 'other-desk', recordedBy: 'dara', status: 'synced' })
    expect(list.find((t) => t.txnId === uploaded.txnId)?.amount).toBe('35.00')
    expect(list.find((t) => t.txnId === mine.txnId)).toMatchObject({ amount: '25.00' })
    expect(list).toHaveLength(3)
    desk.close()
  })
})
