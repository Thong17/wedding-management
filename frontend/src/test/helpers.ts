import { IDBFactory } from 'fake-indexeddb'
import { closeDB } from '@/offline/db'
import { addTransaction, type GiftInput } from '@/offline/transactionRepo'

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

export function addGift(overrides: Partial<GiftInput> = {}, recordedBy = 'demo') {
  return addTransaction(giftInput(overrides), { deviceId: 'dev-1', recordedBy })
}
