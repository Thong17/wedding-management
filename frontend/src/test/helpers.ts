import { IDBFactory } from 'fake-indexeddb'
import { closeDB } from '@/offline/db'
import { addTransaction, type GiftInput, type Recorder } from '@/offline/transactionRepo'

/** Fresh, empty IndexedDB for each test. */
export async function resetDB(): Promise<void> {
  await closeDB()
  globalThis.indexedDB = new IDBFactory()
}

/** Simulate an app reload: drop the connection but keep the stored data. */
export async function simulateReload(): Promise<void> {
  await closeDB()
}

export function giftInput(overrides: Partial<GiftInput> = {}): GiftInput {
  return {
    eventId: 1,
    guestId: 10,
    guestName: 'Sokha Chan',
    amount: '50',
    currency: 'USD',
    method: 'cash',
    note: '',
    ...overrides,
  }
}

export const DEMO_USER: Recorder = { id: 1, username: 'demo' }

/** A plain name records a gift without a user id, like records saved before ids were stored. */
export function addGift(overrides: Partial<GiftInput> = {}, recordedBy: Recorder | string = DEMO_USER) {
  const user = typeof recordedBy === 'string' ? { id: null, username: recordedBy } : recordedBy
  return addTransaction(giftInput(overrides), { deviceId: 'dev-1', recordedBy: user })
}
