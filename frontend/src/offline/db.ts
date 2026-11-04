import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { uuid } from '@/utils/uuid'

export type TxnStatus = 'pending' | 'syncing' | 'synced' | 'failed'
/** How a gift was given. 'item' is a non-money gift (e.g. a watch): described, with no amount. */
export type GiftMethod = 'cash' | 'transfer' | 'other' | 'item'
export type GuestSide = 'bride' | 'groom' | 'both'

/**
 * A gift recorded on this device. IndexedDB is the source of truth for it
 * until the server confirms persistence; records are never deleted before
 * that (and synced ones only by an explicit manual prune).
 */
export interface GiftTransaction {
  txnId: string
  eventId: number
  guestId: number | null
  walkInName: string
  /** Guest name at the time of recording, so the record stays readable if the guest cache changes. */
  guestNameSnapshot: string
  /** Decimal string with two places, e.g. "50.00"; null for an item gift. */
  amount: string | null
  /** What an item gift is (e.g. "Gold watch"); '' or missing for money gifts and older records. */
  item?: string
  currency: string
  method: GiftMethod
  note: string
  createdAt: string
  deviceId: string
  /** Username of the manager who recorded it, as of the last rename seen on this device (for display). */
  recordedBy: string
  /**
   * User id of the manager who recorded it; only that user's session uploads it.
   * Missing on records saved before ids were stored: those match by `recordedBy` until adopted.
   */
  recordedById?: number | null
  status: TxnStatus
  attempts: number
  /** Epoch ms; a pending record is not retried before this. */
  nextAttemptAt: number
  syncStartedAt: number | null
  lastError: string | null
  errorCode: string | null
  errorDetails: Record<string, unknown> | null
  serverGiftId: number | null
  syncedAt: string | null
  /** Voided on the server after syncing: kept for the record, left out of totals. */
  voided?: boolean
  /** Epoch ms of the last local change. */
  updatedAt: number
}

export interface CachedEvent {
  id: number
  name: string
  date: string
  venue: string
  currency: string
  role: string | null
  /** The signed-in user's permission codes on this event, so the offline desk knows what's allowed.
   *  Missing on events cached before roles existed (treated as allowed until refreshed). */
  permissions?: string[]
  full_access?: boolean
}

export interface CachedGuest {
  eventId: number
  id: number
  full_name: string
  nickname: string
  phone: string
  side: GuestSide
  group: string
  table_no: string
  qr_token: string
  updated_at: string
}

export interface GuestSyncMeta {
  eventId: number
  lastSyncedAt: string
}

export interface WeddingDB extends DBSchema {
  events: { key: number; value: CachedEvent }
  guests: {
    key: [number, number]
    value: CachedGuest
    indexes: { byEvent: number; byQr: string }
  }
  guestSyncMeta: { key: number; value: GuestSyncMeta }
  transactions: {
    key: string
    value: GiftTransaction
    indexes: { byStatus: TxnStatus; byEvent: number; byEventStatus: [number, TxnStatus] }
  }
  meta: { key: string; value: string }
}

export const DB_NAME = 'wedding-offline'
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase<WeddingDB>> | null = null

export function getDB(): Promise<IDBPDatabase<WeddingDB>> {
  if (!dbPromise) {
    dbPromise = openDB<WeddingDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore('events', { keyPath: 'id' })

        const guests = db.createObjectStore('guests', { keyPath: ['eventId', 'id'] })
        guests.createIndex('byEvent', 'eventId')
        guests.createIndex('byQr', 'qr_token')

        db.createObjectStore('guestSyncMeta', { keyPath: 'eventId' })

        const txns = db.createObjectStore('transactions', { keyPath: 'txnId' })
        txns.createIndex('byStatus', 'status')
        txns.createIndex('byEvent', 'eventId')
        txns.createIndex('byEventStatus', ['eventId', 'status'])

        db.createObjectStore('meta')
      },
      blocking() {
        // A newer version was opened in another tab: let it upgrade.
        void closeDB()
      },
    }).catch((err) => {
      dbPromise = null
      throw err
    })
  }
  return dbPromise
}

/** Close the connection; the next `getDB()` reopens it (used on version change and in tests). */
export async function closeDB(): Promise<void> {
  if (!dbPromise) return
  const pending = dbPromise
  dbPromise = null
  try {
    ;(await pending).close()
  } catch {
    /* opening had failed; nothing to close */
  }
}

export async function getDeviceId(): Promise<string> {
  const db = await getDB()
  const existing = await db.get('meta', 'deviceId')
  if (existing) return existing
  const id = uuid()
  await db.put('meta', id, 'deviceId')
  return id
}

/** Ask the browser not to evict our data under storage pressure. Best effort. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      return await navigator.storage.persist()
    }
    return (await navigator.storage?.persisted?.()) ?? false
  } catch {
    return false
  }
}
