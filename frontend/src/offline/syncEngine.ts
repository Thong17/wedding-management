import axios from 'axios'
import { AuthExpiredError } from '@/api/http'
import type { SyncItemPayload, SyncItemResult } from '@/api/types'
import type { GiftTransaction } from './db'
import * as repo from './transactionRepo'

export type SyncState = 'idle' | 'syncing' | 'offline' | 'auth-required' | 'error'

export interface SyncSnapshot {
  state: SyncState
  lastSyncAt: string | null
  lastError: string | null
}

export interface SyncEngineOptions {
  send: (items: SyncItemPayload[]) => Promise<{ results: SyncItemResult[] }>
  /** Username whose records this session may upload; null when logged out. */
  currentUser: () => string | null
  batchSize?: number
  isOnline?: () => boolean
  /** Cross-tab mutual exclusion. Returns false if another tab holds the lock. */
  withLock?: (fn: () => Promise<void>) => Promise<boolean>
}

type ErrorKind = 'transient' | 'auth' | 'split'

const RESULT_SUCCESS = new Set(['created', 'duplicate'])

export function classifyError(err: unknown): ErrorKind {
  if (err instanceof AuthExpiredError) return 'auth'
  if (axios.isAxiosError(err)) {
    const status = err.response?.status
    if (status === undefined) return 'transient' // network error, timeout, CORS, server down
    if (status === 401) return 'auth'
    if (status === 408 || status === 425 || status === 429 || status >= 500) return 'transient'
    return 'split' // 400/413/other 4xx: isolate the offending record(s)
  }
  return 'transient'
}

function describe(err: unknown): string {
  if (axios.isAxiosError(err)) {
    if (!err.response) return err.code === 'ECONNABORTED' ? 'Request timed out.' : 'Server unreachable.'
    const detail = (err.response.data as { detail?: unknown } | undefined)?.detail
    return typeof detail === 'string' ? detail : `Server responded ${err.response.status}.`
  }
  return err instanceof Error ? err.message : String(err)
}

function flattenErrors(errors: Record<string, unknown> | undefined): string {
  if (!errors) return 'Rejected by server.'
  return Object.entries(errors)
    .map(([field, msgs]) => {
      const text = Array.isArray(msgs) ? msgs.join(' ') : typeof msgs === 'object' ? JSON.stringify(msgs) : String(msgs)
      return field === 'non_field_errors' ? text : `${field}: ${text}`
    })
    .join('; ')
}

export function toPayload(t: GiftTransaction): SyncItemPayload {
  return {
    client_txn_id: t.txnId,
    event_id: t.eventId,
    guest_id: t.guestId,
    walk_in_name: t.walkInName,
    amount: t.amount,
    currency: t.currency,
    method: t.method,
    note: t.note,
    client_created_at: t.createdAt,
    device_id: t.deviceId,
  }
}

/** Default lock: Web Locks API when present (cross-tab), otherwise none. */
export async function webLock(fn: () => Promise<void>): Promise<boolean> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined
  if (!locks) {
    await fn()
    return true
  }
  return locks.request('gift-sync', { ifAvailable: true }, async (lock) => {
    if (!lock) return false
    await fn()
    return true
  })
}

export class SyncEngine {
  private running: Promise<void> | null = null
  private rerun = false
  private rerunForce = false
  private listeners = new Set<(s: SyncSnapshot) => void>()
  private snapshot: SyncSnapshot = { state: 'idle', lastSyncAt: null, lastError: null }
  private readonly batchSize: number

  constructor(private opts: SyncEngineOptions) {
    this.batchSize = opts.batchSize ?? 50
  }

  get status(): SyncSnapshot {
    return this.snapshot
  }

  subscribe(listener: (s: SyncSnapshot) => void): () => void {
    this.listeners.add(listener)
    listener(this.snapshot)
    return () => this.listeners.delete(listener)
  }

  private set(patch: Partial<SyncSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch }
    this.listeners.forEach((l) => l(this.snapshot))
  }

  /** Call after a successful (re-)login. */
  resumeAfterAuth(): void {
    if (this.snapshot.state === 'auth-required') this.set({ state: 'idle', lastError: null })
  }

  markOffline(): void {
    if (this.snapshot.state !== 'syncing') this.set({ state: 'offline' })
  }

  /**
   * Upload all due pending transactions. Concurrent calls share one run; a call
   * made while running schedules exactly one follow-up run so newly saved gifts
   * are not missed. `force` ignores retry backoff (manual "Sync now").
   */
  sync(options: { force?: boolean } = {}): Promise<void> {
    if (this.running) {
      this.rerun = true
      this.rerunForce ||= !!options.force
      return this.running
    }
    this.running = (async () => {
      let force = !!options.force
      do {
        this.rerun = false
        await this.runOnce(force)
        force = this.rerunForce
        this.rerunForce = false
      } while (this.rerun && this.snapshot.state !== 'auth-required' && this.snapshot.state !== 'offline')
    })().finally(() => {
      this.running = null
    })
    return this.running
  }

  private async runOnce(force: boolean): Promise<void> {
    const user = this.opts.currentUser()
    if (!user) return
    if (this.snapshot.state === 'auth-required' && !force) return
    if (this.opts.isOnline && !this.opts.isOnline()) {
      this.set({ state: 'offline' })
      return
    }
    const lock = this.opts.withLock ?? webLock
    let sawError: string | null = null
    let stopped = false
    this.set({ state: 'syncing' })
    try {
      const acquired = await lock(async () => {
        // We hold the lock, so nothing else is uploading: any `syncing` record is stale.
        await repo.recoverStaleSyncing()
        while (!stopped) {
          const batch = await repo.claimBatch(this.batchSize, { recordedBy: user, ignoreBackoff: force })
          if (!batch.length) break
          const outcome = await this.sendBatch(batch)
          if (outcome.kind !== 'ok') {
            stopped = true
            sawError = outcome.message
            if (outcome.kind === 'auth') {
              this.set({ state: 'auth-required', lastError: outcome.message })
              return
            }
          }
        }
      })
      if (!acquired) {
        // Another tab is syncing; its results reach us via change notifications.
        this.set({ state: 'idle' })
        return
      }
    } catch (err) {
      // Unexpected (e.g. IndexedDB) error: claimed records stay `syncing` and
      // are recovered on the next run. Nothing is discarded.
      sawError = describe(err)
    }
    if (this.snapshot.state === 'auth-required') return
    if (sawError) {
      const offline = this.opts.isOnline && !this.opts.isOnline()
      this.set({ state: offline ? 'offline' : 'error', lastError: sawError })
    } else {
      this.set({ state: 'idle', lastError: null, lastSyncAt: new Date().toISOString() })
    }
  }

  /** Send one batch, splitting it on batch-level client errors to isolate bad records. */
  private async sendBatch(batch: GiftTransaction[]): Promise<{ kind: 'ok' | 'transient' | 'auth'; message: string }> {
    const ids = batch.map((t) => t.txnId)
    let results: SyncItemResult[]
    try {
      const response = await this.opts.send(batch.map(toPayload))
      results = Array.isArray(response?.results) ? response.results : []
    } catch (err) {
      const kind = classifyError(err)
      const message = describe(err)
      if (kind === 'auth') {
        await repo.releaseWithoutPenalty(ids, message)
        return { kind: 'auth', message }
      }
      if (kind === 'transient') {
        await repo.releaseForRetry(ids, message)
        return { kind: 'transient', message }
      }
      if (batch.length === 1) {
        const status = axios.isAxiosError(err) ? err.response?.status : undefined
        await repo.markFailed(ids[0], { code: `http_${status ?? 'error'}`, message })
        return { kind: 'ok', message: '' }
      }
      const mid = Math.ceil(batch.length / 2)
      const halves = [batch.slice(0, mid), batch.slice(mid)]
      for (let i = 0; i < halves.length; i++) {
        const outcome = await this.sendBatch(halves[i])
        if (outcome.kind !== 'ok') {
          // Leave the untried half pending without penalty.
          await repo.releaseWithoutPenalty(halves.slice(i + 1).flat().map((t) => t.txnId))
          return outcome
        }
      }
      return { kind: 'ok', message: '' }
    }

    const byId = new Map(results.filter((r) => r && r.client_txn_id).map((r) => [r.client_txn_id!, r]))
    const missing: string[] = []
    for (const t of batch) {
      const r = byId.get(t.txnId)
      if (!r) missing.push(t.txnId)
      else if (RESULT_SUCCESS.has(r.status)) await repo.markSynced(t.txnId, r.gift_id ?? null)
      else await repo.markFailed(t.txnId, { code: r.code ?? 'rejected', message: flattenErrors(r.errors), details: r.errors ?? null })
    }
    if (missing.length) {
      // A response that doesn't account for a record never drops it.
      await repo.releaseForRetry(missing, 'Server response did not include this transaction.')
      return { kind: 'transient', message: 'Incomplete server response.' }
    }
    return { kind: 'ok', message: '' }
  }
}
