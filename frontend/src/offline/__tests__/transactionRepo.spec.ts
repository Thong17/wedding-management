import { beforeEach, describe, expect, it } from 'vitest'
import { getDB } from '@/offline/db'
import {
  applyServerGift,
  backoffDelay,
  claimBatch,
  countByStatus,
  deleteUnsyncedTransaction,
  GiftValidationError,
  listTransactions,
  markFailed,
  markSynced,
  normalizeAmount,
  pruneSynced,
  recoverStaleSyncing,
  releaseForRetry,
  retryFailed,
  updateUnsyncedTransaction,
  validateGiftInput,
} from '@/offline/transactionRepo'
import { addGift, DEMO_USER, giftInput, resetDB, simulateReload } from '@/test/helpers'

beforeEach(resetDB)

describe('client-side validation', () => {
  it('normalizes valid amounts and rejects invalid ones', () => {
    expect(normalizeAmount('50')).toBe('50.00')
    expect(normalizeAmount('1,234.5')).toBe('1234.50')
    expect(normalizeAmount(20)).toBe('20.00')
    for (const bad of ['', '0', '-5', 'abc', '1.234', '1e3', '99999999999']) expect(normalizeAmount(bad)).toBeNull()
  })

  it('requires a guest or walk-in name, a valid method and amount', () => {
    expect(validateGiftInput(giftInput())).toEqual({})
    const errors = validateGiftInput(giftInput({ guestId: null, walkInName: ' ', amount: '0', method: 'card' as never }))
    expect(Object.keys(errors).sort()).toEqual(['amount', 'guest', 'method'])
  })

  it('refuses to store an invalid gift', async () => {
    await expect(addGift({ amount: '-1' })).rejects.toBeInstanceOf(GiftValidationError)
    expect(await listTransactions()).toHaveLength(0)
  })
})

describe('local storage of gifts', () => {
  it('saves every gift as an individual pending transaction with a stable id', async () => {
    const a = await addGift()
    const b = await addGift({ guestId: null, walkInName: 'Uncle Bo', guestName: '' })
    expect(a.txnId).not.toEqual(b.txnId)
    expect(a).toMatchObject({ status: 'pending', eventId: 1, guestId: 10, amount: '50.00', attempts: 0, recordedBy: 'demo' })
    expect(b).toMatchObject({ guestId: null, walkInName: 'Uncle Bo', guestNameSnapshot: 'Uncle Bo' })
    expect(Date.parse(a.createdAt)).not.toBeNaN()
    expect((await countByStatus()).pending).toBe(2)
  })

  it('keeps pending transactions across an app reload', async () => {
    const saved = await addGift()
    await simulateReload()
    const [reloaded] = await listTransactions({ status: 'pending' })
    expect(reloaded).toEqual(saved)
  })

  it('keeps guests and transactions in separate stores', async () => {
    const db = await getDB()
    expect([...db.objectStoreNames]).toEqual(expect.arrayContaining(['guests', 'transactions']))
  })
})

describe('queue state transitions', () => {
  it('claims each pending record only once, even with concurrent claims', async () => {
    for (let i = 0; i < 5; i++) await addGift()
    const [a, b] = await Promise.all([claimBatch(3, { user: DEMO_USER }), claimBatch(3, { user: DEMO_USER })])
    const ids = [...a, ...b].map((t) => t.txnId)
    expect(ids).toHaveLength(5)
    expect(new Set(ids).size).toBe(5)
    expect((await countByStatus()).syncing).toBe(5)
  })

  it('only claims records of the current user that are due', async () => {
    const mine = await addGift()
    await addGift({}, 'someone-else')
    const [claimed] = await claimBatch(10, { user: DEMO_USER })
    expect(claimed.txnId).toBe(mine.txnId)
    await releaseForRetry([mine.txnId], 'offline')
    expect(await claimBatch(10, { user: DEMO_USER })).toHaveLength(0) // backing off
    expect(await claimBatch(10, { user: DEMO_USER, ignoreBackoff: true })).toHaveLength(1)
  })

  it('does not overwrite a record that is no longer syncing', async () => {
    const t = await addGift()
    await markSynced(t.txnId, 99) // not claimed: no-op
    expect((await listTransactions())[0].status).toBe('pending')
  })

  it('recovers records stuck in syncing back to pending', async () => {
    await addGift()
    await claimBatch(10, { user: DEMO_USER })
    await simulateReload()
    expect(await recoverStaleSyncing()).toBe(1)
    expect((await countByStatus()).pending).toBe(1)
  })

  it('backoff grows exponentially and is capped', () => {
    const mid = () => 0.5
    expect(backoffDelay(1, mid)).toBe(5_000)
    expect(backoffDelay(2, mid)).toBe(10_000)
    expect(backoffDelay(20, mid)).toBe(300_000)
  })

  it('lets the user fix records not on the server yet, and retry failed ones', async () => {
    const t = await addGift()
    // Still waiting to upload: can be corrected right away.
    expect(await updateUnsyncedTransaction(t.txnId, { ...giftInput(), amount: '60' })).toMatchObject({ status: 'pending', amount: '60.00' })
    // Being uploaded: left alone.
    await claimBatch(1, { user: DEMO_USER })
    await expect(updateUnsyncedTransaction(t.txnId, { ...giftInput(), amount: '10' })).rejects.toThrow()
    await markFailed(t.txnId, { code: 'guest_not_found', message: 'Guest not found' })
    const fixed = await updateUnsyncedTransaction(t.txnId, { guestId: null, guestName: '', walkInName: 'Walk In', amount: '75', method: 'transfer' })
    expect(fixed).toMatchObject({ status: 'pending', amount: '75.00', guestId: null, walkInName: 'Walk In', txnId: t.txnId })

    await claimBatch(1, { user: DEMO_USER })
    await markFailed(t.txnId, { code: 'x', message: 'x' })
    expect(await retryFailed()).toBe(1)
    expect((await countByStatus()).pending).toBe(1)
  })

  it('deletes only records that never reached the server', async () => {
    const waiting = await addGift()
    await deleteUnsyncedTransaction(waiting.txnId)
    expect(await listTransactions()).toHaveLength(0)

    const uploaded = await addGift()
    await claimBatch(1, { user: DEMO_USER })
    await expect(deleteUnsyncedTransaction(uploaded.txnId)).rejects.toThrow() // uploading
    await markSynced(uploaded.txnId, 7)
    await expect(deleteUnsyncedTransaction(uploaded.txnId)).rejects.toThrow() // on the server
    expect(await listTransactions()).toHaveLength(1)
  })

  it('mirrors a server correction or void onto the synced copy only', async () => {
    const rec = await addGift()
    const change = { amount: '80.00', method: 'transfer' as const, item: '', note: 'fixed', voided: false }
    await applyServerGift(rec.txnId, change) // not synced yet: ignored
    expect((await listTransactions())[0]).toMatchObject({ amount: '50.00' })

    await claimBatch(1, { user: DEMO_USER })
    await markSynced(rec.txnId, 7)
    await applyServerGift(rec.txnId, change)
    expect((await listTransactions())[0]).toMatchObject({ amount: '80.00', method: 'transfer', note: 'fixed', status: 'synced' })
    await applyServerGift(rec.txnId, { ...change, voided: true })
    expect((await listTransactions())[0].voided).toBe(true)
  })

  it('pruning only ever removes old synced records', async () => {
    const synced = await addGift()
    const other = await addGift()
    await claimBatch(10, { user: DEMO_USER })
    await markSynced(synced.txnId, 1)
    await releaseForRetry([other.txnId], 'offline')
    const db = await getDB()
    const rec = (await db.get('transactions', synced.txnId))!
    await db.put('transactions', { ...rec, syncedAt: new Date(Date.now() - 40 * 86_400_000).toISOString() })
    expect(await pruneSynced(30)).toBe(1)
    const left = await listTransactions()
    expect(left).toHaveLength(1)
    expect(left[0].status).toBe('pending')
  })
})

describe('item gifts (non-money, e.g. a watch)', () => {
  const item = (overrides = {}) => giftInput({ method: 'item', amount: '', item: '  Gold watch ', ...overrides })

  it('needs a description, never an amount', () => {
    expect(validateGiftInput(item())).toEqual({})
    expect(validateGiftInput(item({ item: '   ' }))).toHaveProperty('item')
    expect(validateGiftInput(item({ item: 'x'.repeat(201) }))).toHaveProperty('item')
    // An item ignores whatever is in the amount field; a money gift still needs one.
    expect(validateGiftInput(item({ amount: 'abc' }))).toEqual({})
    expect(validateGiftInput(giftInput({ method: 'cash', amount: '' }))).toHaveProperty('amount')
  })

  it('is stored with no amount and a trimmed description, and uploads that way', async () => {
    const rec = await addGift({ method: 'item', amount: '99', item: '  Gold watch ' })
    expect(rec).toMatchObject({ method: 'item', amount: null, item: 'Gold watch' })
    const money = await addGift({ item: 'ignored' })
    expect(money).toMatchObject({ amount: '50.00', item: '' })
    const { toPayload } = await import('@/offline/syncEngine')
    expect(toPayload(rec)).toMatchObject({ method: 'item', amount: null, item: 'Gold watch' })
  })

  it('a failed gift can be corrected between money and item', async () => {
    const rec = await addGift()
    await claimBatch(1, { user: DEMO_USER })
    await markFailed(rec.txnId, { code: 'validation', message: 'x' })
    const asItem = await updateUnsyncedTransaction(rec.txnId, { ...item(), guestId: rec.guestId, guestName: 'Sokha Chan' })
    expect(asItem).toMatchObject({ method: 'item', amount: null, item: 'Gold watch', status: 'pending' })
  })
})
