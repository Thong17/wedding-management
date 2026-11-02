import { guestsApi } from '@/api/endpoints'
import type { ApiEvent, ApiGuest, GuestListResponse } from '@/api/types'
import { getDB, type CachedEvent, type CachedGuest } from './db'
import { tokenPrefixFromShort, type GuestRef } from './inviteQr'

type GuestFetcher = (eventId: number, updatedSince?: string) => Promise<GuestListResponse>

function toCached(eventId: number, g: ApiGuest): CachedGuest {
  return {
    eventId,
    id: g.id,
    full_name: g.full_name,
    nickname: g.nickname,
    phone: g.phone,
    side: g.side,
    group: g.group,
    table_no: g.table_no,
    qr_token: g.qr_token,
    updated_at: g.updated_at,
  }
}

/**
 * Download the event's guest list into IndexedDB: the full list the first time,
 * then only changes (including deletions) since the last successful refresh.
 * The whole update is one IndexedDB transaction, so the cache is never half-written.
 */
export async function refreshGuestCache(
  eventId: number,
  opts: { full?: boolean; fetcher?: GuestFetcher } = {},
): Promise<{ full: boolean; changed: number }> {
  const db = await getDB()
  const meta = opts.full ? undefined : await db.get('guestSyncMeta', eventId)
  const response = await (opts.fetcher ?? guestsApi.list)(eventId, meta?.lastSyncedAt)

  const tx = db.transaction(['guests', 'guestSyncMeta'], 'readwrite')
  const guests = tx.objectStore('guests')
  if (response.full) {
    const existingKeys = await guests.index('byEvent').getAllKeys(eventId)
    for (const key of existingKeys) await guests.delete(key)
  }
  for (const g of response.results) {
    if (g.is_deleted) await guests.delete([eventId, g.id])
    else await guests.put(toCached(eventId, g))
  }
  await tx.objectStore('guestSyncMeta').put({ eventId, lastSyncedAt: response.server_time })
  await tx.done
  return { full: response.full, changed: response.results.length }
}

export async function getCachedGuests(eventId: number): Promise<CachedGuest[]> {
  const rows = await (await getDB()).getAllFromIndex('guests', 'byEvent', eventId)
  return rows.sort((a, b) => a.full_name.localeCompare(b.full_name))
}

export async function findGuestByQrToken(eventId: number, token: string): Promise<CachedGuest | undefined> {
  const matches = await (await getDB()).getAllFromIndex('guests', 'byQr', token.toLowerCase())
  return matches.find((g) => g.eventId === eventId)
}

/** Find a guest from a scanned reference: a full token, or the 16-hex-char prefix a bank QR carries. */
export async function findGuestByQrRef(eventId: number, ref: GuestRef): Promise<CachedGuest | undefined> {
  if (ref.kind === 'token') return findGuestByQrToken(eventId, ref.token)
  const start = tokenPrefixFromShort(ref.prefix)
  const matches = await (await getDB()).getAllFromIndex('guests', 'byQr', IDBKeyRange.bound(start, start + '￿'))
  // 64 bits of a random token: a clash within one event is practically impossible, but never guess between two.
  const inEvent = matches.filter((g) => g.eventId === eventId)
  return inEvent.length === 1 ? inEvent[0] : undefined
}

export async function getGuestCacheTime(eventId: number): Promise<string | null> {
  return (await (await getDB()).get('guestSyncMeta', eventId))?.lastSyncedAt ?? null
}

export async function cacheEvents(events: ApiEvent[]): Promise<void> {
  const db = await getDB()
  const tx = db.transaction('events', 'readwrite')
  await tx.store.clear()
  for (const e of events) {
    await tx.store.put({ id: e.id, name: e.name, date: e.date, venue: e.venue, currency: e.currency, role: e.role })
  }
  await tx.done
}

export async function cacheEvent(e: ApiEvent): Promise<void> {
  await (await getDB()).put('events', { id: e.id, name: e.name, date: e.date, venue: e.venue, currency: e.currency, role: e.role })
}

export async function getCachedEvents(): Promise<CachedEvent[]> {
  return (await getDB()).getAll('events')
}

export async function getCachedEvent(id: number): Promise<CachedEvent | undefined> {
  return (await getDB()).get('events', id)
}
