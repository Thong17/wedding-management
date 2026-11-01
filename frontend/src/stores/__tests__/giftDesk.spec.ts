import { http as mswHttp, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { createPinia, setActivePinia } from 'pinia'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { API_URL, tokens } from '@/api/http'
import { getDB } from '@/offline/db'
import { listTransactions } from '@/offline/transactionRepo'
import { useGiftDeskStore } from '@/stores/giftDesk'
import { useSyncStore } from '@/stores/sync'
import { resetDB, simulateReload } from '@/test/helpers'

// The backend is unreachable for the whole file.
const server = setupServer(mswHttp.all(`${API_URL}/*`, () => HttpResponse.error()))

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterAll(() => server.close())
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
