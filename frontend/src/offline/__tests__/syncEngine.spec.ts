import { http as mswHttp, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { giftsApi } from '@/api/endpoints'
import { API_URL, tokens } from '@/api/http'
import type { SyncItemPayload, SyncItemResult } from '@/api/types'
import { SyncEngine } from '@/offline/syncEngine'
import { adoptRecords, claimBatch, countByStatus, getTransaction, listTransactions, retryFailed, type Recorder } from '@/offline/transactionRepo'
import { addGift, DEMO_USER, resetDB, simulateReload } from '@/test/helpers'

const SYNC_URL = `${API_URL}/gifts/sync/`
const REFRESH_URL = `${API_URL}/auth/token/refresh/`

/** Fake server: stores by client_txn_id (idempotent) and records every request. */
const serverGifts = new Map<string, number>()
let requests: { auth: string | null; items: SyncItemPayload[] }[] = []
let reject: (item: SyncItemPayload) => SyncItemResult | null = () => null

function idempotentHandler(item: SyncItemPayload): SyncItemResult {
  const custom = reject(item)
  if (custom) return custom
  const existing = serverGifts.get(item.client_txn_id)
  if (existing) return { client_txn_id: item.client_txn_id, status: 'duplicate', gift_id: existing }
  const id = serverGifts.size + 1
  serverGifts.set(item.client_txn_id, id)
  return { client_txn_id: item.client_txn_id, status: 'created', gift_id: id }
}

const okHandler = mswHttp.post(SYNC_URL, async ({ request }) => {
  const body = (await request.json()) as { transactions: SyncItemPayload[] }
  requests.push({ auth: request.headers.get('authorization'), items: body.transactions })
  return HttpResponse.json({ results: body.transactions.map(idempotentHandler) })
})

const server = setupServer(okHandler)

function makeEngine(user: Recorder | null = DEMO_USER, online = true) {
  return new SyncEngine({ send: giftsApi.sync, currentUser: () => user, isOnline: () => online, batchSize: 50 })
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterAll(() => server.close())
beforeEach(async () => {
  await resetDB()
  serverGifts.clear()
  requests = []
  reject = () => null
  tokens.set('access-1', 'refresh-1')
})
afterEach(() => server.resetHandlers())

describe('SyncEngine', () => {
  it('uploads pending gifts and marks them synced', async () => {
    const a = await addGift()
    const b = await addGift({ amount: '20' })
    const engine = makeEngine()
    await engine.sync()
    expect(requests).toHaveLength(1)
    expect(requests[0].auth).toBe('Bearer access-1')
    expect(requests[0].items.map((i) => i.client_txn_id).sort()).toEqual([a.txnId, b.txnId].sort())
    expect(requests[0].items[0]).toMatchObject({ event_id: 1, currency: 'USD', device_id: 'dev-1' })
    const after = await getTransaction(a.txnId)
    expect(after).toMatchObject({ status: 'synced', serverGiftId: expect.any(Number) })
    expect(engine.status.state).toBe('idle')
    expect(engine.status.lastSyncAt).not.toBeNull()
  })

  it('does nothing when the browser reports offline, and keeps the record', async () => {
    await addGift()
    const engine = makeEngine(DEMO_USER, false)
    await engine.sync()
    expect(requests).toHaveLength(0)
    expect(engine.status.state).toBe('offline')
    expect((await countByStatus()).pending).toBe(1)
  })

  it('syncs gifts saved before an app reload', async () => {
    const t = await addGift()
    await simulateReload()
    await makeEngine().sync()
    expect((await getTransaction(t.txnId))?.status).toBe('synced')
  })

  it('returns records to pending with backoff on network failure', async () => {
    server.use(mswHttp.post(SYNC_URL, () => HttpResponse.error()))
    const t = await addGift()
    const engine = makeEngine()
    const before = Date.now()
    await engine.sync()
    const rec = (await getTransaction(t.txnId))!
    expect(rec.status).toBe('pending')
    expect(rec.attempts).toBe(1)
    expect(rec.nextAttemptAt).toBeGreaterThan(before)
    expect(rec.errorCode).toBe('temporary')
    expect(engine.status.state).toBe('error')
  })

  it('treats 5xx as temporary and succeeds on a later retry', async () => {
    server.use(mswHttp.post(SYNC_URL, () => new HttpResponse(null, { status: 503 }), { once: true }))
    const t = await addGift()
    const engine = makeEngine()
    await engine.sync()
    expect((await getTransaction(t.txnId))?.status).toBe('pending')
    await engine.sync() // still backing off: nothing sent
    expect(requests).toHaveLength(0)
    await engine.sync({ force: true }) // "Sync now"
    expect((await getTransaction(t.txnId))?.status).toBe('synced')
  })

  it('treats a duplicate response as success and never creates a second server record', async () => {
    const t = await addGift()
    serverGifts.set(t.txnId, 42) // server already stored it (e.g. response was lost)
    await makeEngine().sync()
    expect(await getTransaction(t.txnId)).toMatchObject({ status: 'synced', serverGiftId: 42 })
    expect(serverGifts.size).toBe(1)
  })

  it('re-sends safely after a crash mid-upload without duplicating', async () => {
    const t = await addGift()
    await claimBatch(10, { user: DEMO_USER }) // tab closed while "syncing"
    serverGifts.set(t.txnId, 7) // ...after the server had stored it
    await simulateReload()
    await makeEngine().sync()
    expect(await getTransaction(t.txnId)).toMatchObject({ status: 'synced', serverGiftId: 7 })
    expect(serverGifts.size).toBe(1)
  })

  it('handles partial batch failures per record', async () => {
    const good = await addGift()
    const bad = await addGift({ guestId: 999 })
    reject = (item) =>
      item.guest_id === 999
        ? { client_txn_id: item.client_txn_id, status: 'rejected', code: 'guest_not_found', errors: { guest_id: ['Guest not found in this event.'] } }
        : null
    await makeEngine().sync()
    expect((await getTransaction(good.txnId))?.status).toBe('synced')
    expect(await getTransaction(bad.txnId)).toMatchObject({
      status: 'failed',
      errorCode: 'guest_not_found',
      lastError: 'guest_id: Guest not found in this event.',
    })
  })

  it('never drops a record the server response does not mention', async () => {
    server.use(mswHttp.post(SYNC_URL, () => HttpResponse.json({ results: [] })))
    const t = await addGift()
    await makeEngine().sync()
    expect(await getTransaction(t.txnId)).toMatchObject({ status: 'pending', attempts: 1 })
  })

  it('splits a batch rejected as a whole to isolate the bad record', async () => {
    const records = [await addGift(), await addGift({ note: 'poison' }), await addGift(), await addGift()]
    server.use(
      mswHttp.post(SYNC_URL, async ({ request }) => {
        const body = (await request.json()) as { transactions: SyncItemPayload[] }
        requests.push({ auth: null, items: body.transactions })
        if (body.transactions.some((t) => t.note === 'poison')) return HttpResponse.json({ detail: 'Malformed.' }, { status: 400 })
        return HttpResponse.json({ results: body.transactions.map(idempotentHandler) })
      }),
    )
    await makeEngine().sync()
    const statuses = await Promise.all(records.map(async (r) => (await getTransaction(r.txnId))!.status))
    expect(statuses).toEqual(['synced', 'failed', 'synced', 'synced'])
    expect((await getTransaction(records[1].txnId))?.errorCode).toBe('http_400')
  })

  it('refreshes an expired access token once and retries', async () => {
    let refreshCalls = 0
    server.use(
      mswHttp.post(REFRESH_URL, () => {
        refreshCalls++
        return HttpResponse.json({ access: 'access-2' })
      }),
      mswHttp.post(SYNC_URL, ({ request }) =>
        request.headers.get('authorization') === 'Bearer access-1' ? new HttpResponse(null, { status: 401 }) : undefined,
      ),
    )
    const t = await addGift()
    await makeEngine().sync()
    expect(refreshCalls).toBe(1)
    expect(tokens.access).toBe('access-2')
    expect((await getTransaction(t.txnId))?.status).toBe('synced')
  })

  it('pauses with auth-required when the session cannot be refreshed, losing nothing', async () => {
    server.use(
      mswHttp.post(REFRESH_URL, () => HttpResponse.json({ detail: 'Token is invalid' }, { status: 401 })),
      mswHttp.post(SYNC_URL, () => new HttpResponse(null, { status: 401 })),
    )
    const t = await addGift()
    const engine = makeEngine()
    await engine.sync()
    expect(engine.status.state).toBe('auth-required')
    expect(await getTransaction(t.txnId)).toMatchObject({ status: 'pending', attempts: 0 })
    expect(tokens.refresh).toBeNull()

    // After logging in again, the queue uploads.
    server.resetHandlers()
    tokens.set('access-3', 'refresh-3')
    engine.resumeAfterAuth()
    await engine.sync()
    expect((await getTransaction(t.txnId))?.status).toBe('synced')
  })

  it('runs one sync at a time and sends each record once', async () => {
    for (let i = 0; i < 5; i++) await addGift()
    const engine = makeEngine()
    await Promise.all([engine.sync(), engine.sync(), engine.sync()])
    const sent = requests.flatMap((r) => r.items.map((i) => i.client_txn_id))
    expect(sent).toHaveLength(5)
    expect(new Set(sent).size).toBe(5)
    expect((await countByStatus()).synced).toBe(5)
  })

  it('picks up gifts recorded while a sync is in flight', async () => {
    await addGift()
    const engine = makeEngine()
    const first = engine.sync()
    const late = await addGift()
    await Promise.all([first, engine.sync()])
    expect((await getTransaction(late.txnId))?.status).toBe('synced')
  })

  it('uploads in batches', async () => {
    for (let i = 0; i < 7; i++) await addGift()
    await new SyncEngine({ send: giftsApi.sync, currentUser: () => DEMO_USER, batchSize: 3 }).sync()
    expect(requests.map((r) => r.items.length)).toEqual([3, 3, 1])
  })

  it("leaves another user's records for that user", async () => {
    const other = await addGift({}, 'other-manager')
    const otherWithId = await addGift({}, { id: 2, username: 'second' })
    await makeEngine().sync()
    expect(requests).toHaveLength(0)
    expect((await getTransaction(other.txnId))?.status).toBe('pending')
    expect((await getTransaction(otherWithId.txnId))?.status).toBe('pending')
  })

  it('still uploads my gifts after I rename myself', async () => {
    const t = await addGift()
    await makeEngine({ id: DEMO_USER.id, username: 'demo-renamed' }).sync()
    expect((await getTransaction(t.txnId))?.status).toBe('synced')
  })

  it('adopts records saved before ids by name, including a previous name', async () => {
    const legacy = await addGift({}, 'demo')
    const oldName = await addGift({}, 'old-demo')
    const someoneElse = await addGift({}, 'stranger')
    expect(await adoptRecords({ id: 1, username: 'demo' }, ['old-demo'])).toBe(2)
    expect(await getTransaction(legacy.txnId)).toMatchObject({ recordedById: 1, recordedBy: 'demo' })
    expect(await getTransaction(oldName.txnId)).toMatchObject({ recordedById: 1, recordedBy: 'demo' })
    expect((await getTransaction(someoneElse.txnId))?.recordedById).toBeNull()
  })

  it('a failed record can be retried and then syncs', async () => {
    let fail = true
    reject = (item) => (fail ? { client_txn_id: item.client_txn_id, status: 'rejected', code: 'forbidden', errors: { event_id: ['No access'] } } : null)
    const t = await addGift()
    const engine = makeEngine()
    await engine.sync()
    expect((await getTransaction(t.txnId))?.status).toBe('failed')
    fail = false
    await retryFailed([t.txnId])
    await engine.sync()
    expect((await getTransaction(t.txnId))?.status).toBe('synced')
    expect((await listTransactions()).length).toBe(1)
  })
})
