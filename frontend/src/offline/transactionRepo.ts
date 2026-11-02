import { t } from '@/i18n'
import { uuid } from '@/utils/uuid'
import { notifyTransactionsChanged } from './changes'
import { getDB, type GiftMethod, type GiftTransaction, type TxnStatus } from './db'

export const GIFT_METHODS: GiftMethod[] = ['cash', 'transfer', 'other', 'item']
const MAX_ITEM_LENGTH = 200
const MAX_AMOUNT = 9_999_999_999.99
const BACKOFF_BASE_MS = 5_000
const BACKOFF_MAX_MS = 5 * 60_000

/** The manager a record belongs to. Matched by id, which never changes; usernames can be renamed. */
export interface Recorder {
  id: number | null
  username: string
}

export function isRecordedBy(rec: Pick<GiftTransaction, 'recordedBy' | 'recordedById'>, user: Recorder): boolean {
  if (rec.recordedById != null && user.id != null) return rec.recordedById === user.id
  return rec.recordedBy === user.username
}

export interface GiftInput {
  eventId: number
  guestId: number | null
  guestName: string
  walkInName?: string
  /** Ignored for item gifts. */
  amount: string | number
  currency: string
  method: GiftMethod
  /** Required for item gifts (e.g. "Gold watch"), ignored otherwise. */
  item?: string
  note?: string
}

export type ValidationErrors = Partial<Record<'guest' | 'amount' | 'item' | 'method' | 'note' | 'currency' | 'event', string>>

/** Amount and item as stored: item gifts keep their description and no amount; money gifts the reverse. */
function amountAndItem(input: Pick<GiftInput, 'amount' | 'method' | 'item'>): { amount: string | null; item: string } {
  return input.method === 'item'
    ? { amount: null, item: (input.item ?? '').trim() }
    : { amount: normalizeAmount(input.amount), item: '' }
}

export class GiftValidationError extends Error {
  constructor(public errors: ValidationErrors) {
    super(Object.values(errors).join(' '))
    this.name = 'GiftValidationError'
  }
}

/** Parse an amount into a two-decimal string, or null if it is not a valid positive amount. */
export function normalizeAmount(value: string | number): string | null {
  const text = String(value).trim().replace(/,/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null
  const n = Number(text)
  if (!(n > 0) || n > MAX_AMOUNT) return null
  return n.toFixed(2)
}

export function validateGiftInput(input: GiftInput): ValidationErrors {
  const errors: ValidationErrors = {}
  if (!Number.isInteger(input.eventId) || input.eventId <= 0) errors.event = t('validation.event')
  const walkIn = (input.walkInName ?? '').trim()
  if (input.guestId == null && !walkIn) errors.guest = t('validation.guest')
  if (walkIn.length > 200) errors.guest = t('validation.nameTooLong')
  if (input.method === 'item') {
    const item = (input.item ?? '').trim()
    if (!item) errors.item = t('validation.item')
    else if (item.length > MAX_ITEM_LENGTH) errors.item = t('validation.itemTooLong')
  } else if (normalizeAmount(input.amount) === null) errors.amount = t('validation.amount')
  if (!GIFT_METHODS.includes(input.method)) errors.method = t('validation.method')
  if ((input.note ?? '').length > 500) errors.note = t('validation.note')
  if (!/^[A-Z]{3}$/.test(input.currency)) errors.currency = t('validation.currency')
  return errors
}

export function backoffDelay(attempts: number, random: () => number = Math.random): number {
  const base = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, attempts - 1))
  return Math.round(base * (0.8 + random() * 0.4))
}

/** Save a gift locally. Resolves as soon as IndexedDB has committed it. */
export async function addTransaction(
  input: GiftInput,
  ctx: { deviceId: string; recordedBy: Recorder; now?: Date },
): Promise<GiftTransaction> {
  const errors = validateGiftInput(input)
  if (Object.keys(errors).length) throw new GiftValidationError(errors)
  const now = ctx.now ?? new Date()
  const walkInName = input.guestId == null ? (input.walkInName ?? '').trim() : ''
  const record: GiftTransaction = {
    txnId: uuid(),
    eventId: input.eventId,
    guestId: input.guestId,
    walkInName,
    guestNameSnapshot: input.guestId == null ? walkInName : input.guestName,
    ...amountAndItem(input),
    currency: input.currency,
    method: input.method,
    note: (input.note ?? '').trim(),
    createdAt: now.toISOString(),
    deviceId: ctx.deviceId,
    recordedBy: ctx.recordedBy.username,
    recordedById: ctx.recordedBy.id,
    status: 'pending',
    attempts: 0,
    nextAttemptAt: 0,
    syncStartedAt: null,
    lastError: null,
    errorCode: null,
    errorDetails: null,
    serverGiftId: null,
    syncedAt: null,
    updatedAt: now.getTime(),
  }
  const db = await getDB()
  // `add` (not `put`) so a txnId collision can never overwrite an existing record.
  const tx = db.transaction('transactions', 'readwrite')
  await tx.store.add(record)
  await tx.done
  notifyTransactionsChanged()
  return record
}

export async function getTransaction(txnId: string): Promise<GiftTransaction | undefined> {
  return (await getDB()).get('transactions', txnId)
}

export async function listTransactions(filter: { eventId?: number; status?: TxnStatus } = {}): Promise<GiftTransaction[]> {
  const db = await getDB()
  let rows: GiftTransaction[]
  if (filter.eventId != null && filter.status) {
    rows = await db.getAllFromIndex('transactions', 'byEventStatus', [filter.eventId, filter.status])
  } else if (filter.eventId != null) {
    rows = await db.getAllFromIndex('transactions', 'byEvent', filter.eventId)
  } else if (filter.status) {
    rows = await db.getAllFromIndex('transactions', 'byStatus', filter.status)
  } else {
    rows = await db.getAll('transactions')
  }
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export type StatusCounts = Record<TxnStatus, number>

export async function countByStatus(eventId?: number): Promise<StatusCounts> {
  const db = await getDB()
  const statuses: TxnStatus[] = ['pending', 'syncing', 'synced', 'failed']
  const counts = await Promise.all(
    statuses.map((s) =>
      eventId == null
        ? db.countFromIndex('transactions', 'byStatus', s)
        : db.countFromIndex('transactions', 'byEventStatus', [eventId, s]),
    ),
  )
  return Object.fromEntries(statuses.map((s, i) => [s, counts[i]])) as StatusCounts
}

/** Earliest `nextAttemptAt` among pending records of this user, if any. */
export async function nextRetryAt(user: Recorder): Promise<number | null> {
  const pending = await (await getDB()).getAllFromIndex('transactions', 'byStatus', 'pending')
  const times = pending.filter((t) => isRecordedBy(t, user)).map((t) => t.nextAttemptAt)
  return times.length ? Math.min(...times) : null
}

/**
 * Tag this user's records with their id and current username: records saved before ids
 * were stored (matched by `username` or any of `previousNames`), and records of theirs
 * still showing an old name after a rename. Returns how many records changed.
 */
export async function adoptRecords(user: Recorder & { id: number }, previousNames: string[] = []): Promise<number> {
  const names = new Set([user.username, ...previousNames])
  const db = await getDB()
  const tx = db.transaction('transactions', 'readwrite')
  let changed = 0
  let cursor = await tx.store.openCursor()
  while (cursor) {
    const rec = cursor.value
    const mine = rec.recordedById != null ? rec.recordedById === user.id : names.has(rec.recordedBy)
    if (mine && (rec.recordedById !== user.id || rec.recordedBy !== user.username)) {
      await cursor.update({ ...rec, recordedById: user.id, recordedBy: user.username })
      changed++
    }
    cursor = await cursor.continue()
  }
  await tx.done
  if (changed) notifyTransactionsChanged()
  return changed
}

/**
 * Atomically move up to `limit` due pending records of `user` to `syncing`.
 * Done in one readwrite transaction so two callers can never claim the same record.
 */
export async function claimBatch(
  limit: number,
  opts: { user: Recorder; now?: number; ignoreBackoff?: boolean },
): Promise<GiftTransaction[]> {
  const now = opts.now ?? Date.now()
  const db = await getDB()
  const tx = db.transaction('transactions', 'readwrite')
  const claimed: GiftTransaction[] = []
  let cursor = await tx.store.index('byStatus').openCursor('pending')
  while (cursor && claimed.length < limit) {
    const rec = cursor.value
    if (isRecordedBy(rec, opts.user) && (opts.ignoreBackoff || rec.nextAttemptAt <= now)) {
      const updated: GiftTransaction = { ...rec, status: 'syncing', syncStartedAt: now, updatedAt: now }
      await cursor.update(updated)
      claimed.push(updated)
    }
    cursor = await cursor.continue()
  }
  await tx.done
  claimed.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  if (claimed.length) notifyTransactionsChanged()
  return claimed
}

/**
 * Apply `change` to each record that is still `syncing`, re-reading it inside
 * the same transaction so a concurrent local edit is never overwritten.
 */
async function updateSyncing(
  txnIds: string[],
  change: (rec: GiftTransaction, now: number) => Partial<GiftTransaction>,
): Promise<void> {
  if (!txnIds.length) return
  const db = await getDB()
  const tx = db.transaction('transactions', 'readwrite')
  const now = Date.now()
  for (const id of txnIds) {
    const rec = await tx.store.get(id)
    if (rec && rec.status === 'syncing') {
      await tx.store.put({ ...rec, ...change(rec, now), syncStartedAt: null, updatedAt: now })
    }
  }
  await tx.done
  notifyTransactionsChanged()
}

export function markSynced(txnId: string, serverGiftId: number | null): Promise<void> {
  return updateSyncing([txnId], (_rec, now) => ({
    status: 'synced',
    serverGiftId,
    syncedAt: new Date(now).toISOString(),
    lastError: null,
    errorCode: null,
    errorDetails: null,
  }))
}

/** Permanent failure (validation/processing). Stays on device until the user fixes or retries it. */
export function markFailed(
  txnId: string,
  failure: { code: string; message: string; details?: Record<string, unknown> | null },
): Promise<void> {
  return updateSyncing([txnId], (rec) => ({
    status: 'failed',
    attempts: rec.attempts + 1,
    errorCode: failure.code,
    lastError: failure.message,
    errorDetails: failure.details ?? null,
  }))
}

/** Temporary failure: back to pending with exponential backoff. */
export function releaseForRetry(txnIds: string[], message: string): Promise<void> {
  return updateSyncing(txnIds, (rec, now) => ({
    status: 'pending',
    attempts: rec.attempts + 1,
    nextAttemptAt: now + backoffDelay(rec.attempts + 1),
    lastError: message,
    errorCode: 'temporary',
  }))
}

/** Back to pending without counting an attempt (e.g. sync paused for re-login). */
export function releaseWithoutPenalty(txnIds: string[], message?: string): Promise<void> {
  return updateSyncing(txnIds, (rec) => ({ status: 'pending', lastError: message ?? rec.lastError }))
}

/**
 * Return records stuck in `syncing` (tab closed or crashed mid-upload) to
 * `pending`. Only call while holding the sync lock. Re-sending is safe
 * because the server is idempotent on `txnId`.
 */
export async function recoverStaleSyncing(olderThanMs = 0): Promise<number> {
  const db = await getDB()
  const cutoff = Date.now() - olderThanMs
  const stuck = (await db.getAllFromIndex('transactions', 'byStatus', 'syncing')).filter(
    (t) => (t.syncStartedAt ?? 0) <= cutoff,
  )
  await releaseWithoutPenalty(stuck.map((t) => t.txnId))
  return stuck.length
}

/** User-initiated retry of failed records. */
export async function retryFailed(txnIds?: string[]): Promise<number> {
  const db = await getDB()
  const tx = db.transaction('transactions', 'readwrite')
  const ids = txnIds ?? (await tx.store.index('byStatus').getAllKeys('failed'))
  let n = 0
  for (const id of ids) {
    const rec = await tx.store.get(id)
    if (rec?.status === 'failed') {
      await tx.store.put({ ...rec, status: 'pending', nextAttemptAt: 0, updatedAt: Date.now() })
      n++
    }
  }
  await tx.done
  if (n) notifyTransactionsChanged()
  return n
}

/** Fix a failed record (e.g. wrong amount or guest) and queue it again. */
export async function updateFailedTransaction(
  txnId: string,
  patch: Pick<GiftInput, 'guestId' | 'guestName' | 'walkInName' | 'amount' | 'method' | 'item' | 'note'>,
): Promise<GiftTransaction> {
  const db = await getDB()
  const tx = db.transaction('transactions', 'readwrite')
  const rec = await tx.store.get(txnId)
  if (!rec) throw new Error('Transaction not found.')
  if (rec.status !== 'failed') throw new Error('Only failed transactions can be edited.')
  const errors = validateGiftInput({ ...patch, eventId: rec.eventId, currency: rec.currency })
  if (Object.keys(errors).length) throw new GiftValidationError(errors)
  const walkInName = patch.guestId == null ? (patch.walkInName ?? '').trim() : ''
  const updated: GiftTransaction = {
    ...rec,
    guestId: patch.guestId,
    walkInName,
    guestNameSnapshot: patch.guestId == null ? walkInName : patch.guestName,
    ...amountAndItem(patch),
    method: patch.method,
    note: (patch.note ?? '').trim(),
    status: 'pending',
    nextAttemptAt: 0,
    updatedAt: Date.now(),
  }
  await tx.store.put(updated)
  await tx.done
  notifyTransactionsChanged()
  return updated
}

/** Explicit, user-triggered cleanup. Only ever removes server-confirmed records. */
export async function pruneSynced(olderThanDays: number): Promise<number> {
  const cutoff = Date.now() - olderThanDays * 86_400_000
  const db = await getDB()
  const tx = db.transaction('transactions', 'readwrite')
  let cursor = await tx.store.index('byStatus').openCursor('synced')
  let n = 0
  while (cursor) {
    if (cursor.value.syncedAt && Date.parse(cursor.value.syncedAt) < cutoff) {
      await cursor.delete()
      n++
    }
    cursor = await cursor.continue()
  }
  await tx.done
  if (n) notifyTransactionsChanged()
  return n
}

export function toCsv(rows: GiftTransaction[]): string {
  const cols: (keyof GiftTransaction)[] = [
    'txnId', 'eventId', 'guestId', 'guestNameSnapshot', 'amount', 'currency', 'method', 'item', 'note',
    'createdAt', 'recordedBy', 'status', 'attempts', 'errorCode', 'lastError', 'serverGiftId', 'syncedAt',
  ]
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n')
}
