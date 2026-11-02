import { beforeEach, describe, expect, it } from 'vitest'
import { getDB } from '@/offline/db'
import {
  backoffDelay,
  claimBatch,
  countByStatus,
  GiftValidationError,
  listTransactions,
  markFailed,
  markSynced,
  normalizeAmount,
  pruneSynced,
  recoverStaleSyncing,
  releaseForRetry,
  retryFailed,
  updateFailedTransaction,
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

  it('lets the user retry or fix failed records only', async () => {
    const t = await addGift()
    await expect(updateFailedTransaction(t.txnId, { ...giftInput(), amount: '10' })).rejects.toThrow(/Only failed/)
    await claimBatch(1, { user: DEMO_USER })
    await markFailed(t.txnId, { code: 'guest_not_found', message: 'Guest not found' })
    const fixed = await updateFailedTransaction(t.txnId, { guestId: null, guestName: '', walkInName: 'Walk In', amount: '75', method: 'transfer' })
    expect(fixed).toMatchObject({ status: 'pending', amount: '75.00', guestId: null, walkInName: 'Walk In', txnId: t.txnId })

    await claimBatch(1, { user: DEMO_USER })
    await markFailed(t.txnId, { code: 'x', message: 'x' })
    expect(await retryFailed()).toBe(1)
    expect((await countByStatus()).pending).toBe(1)
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
