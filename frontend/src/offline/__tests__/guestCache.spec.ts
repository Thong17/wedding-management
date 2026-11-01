import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiGuest, GuestListResponse } from '@/api/types'
import { findGuestByQrToken, getCachedGuests, getGuestCacheTime, refreshGuestCache } from '@/offline/guestCache'
import { resetDB } from '@/test/helpers'

beforeEach(resetDB)

const guest = (id: number, name: string, extra: Partial<ApiGuest> = {}): ApiGuest => ({
  id,
  event: 1,
  full_name: name,
  nickname: '',
  phone: '',
  side: 'both',
  group: '',
  table_no: '',
  qr_token: `00000000-0000-4000-8000-00000000000${id}`,
  is_deleted: false,
  updated_at: '2026-10-24T10:00:00Z',
  ...extra,
})

describe('guest cache', () => {
  it('downloads the full list first, then applies deltas and tombstones', async () => {
    const fetcher = vi
      .fn<(eventId: number, since?: string) => Promise<GuestListResponse>>()
      .mockResolvedValueOnce({ server_time: 'T1', full: true, results: [guest(1, 'Alice'), guest(2, 'Bob')] })
      .mockResolvedValueOnce({
        server_time: 'T2',
        full: false,
        results: [guest(2, 'Bob', { is_deleted: true }), guest(3, 'Carl'), guest(1, 'Alice Renamed')],
      })

    await refreshGuestCache(1, { fetcher })
    expect(fetcher).toHaveBeenLastCalledWith(1, undefined)
    expect((await getCachedGuests(1)).map((g) => g.full_name)).toEqual(['Alice', 'Bob'])
    expect(await getGuestCacheTime(1)).toBe('T1')

    await refreshGuestCache(1, { fetcher })
    expect(fetcher).toHaveBeenLastCalledWith(1, 'T1')
    expect((await getCachedGuests(1)).map((g) => g.full_name)).toEqual(['Alice Renamed', 'Carl'])
    expect(await getGuestCacheTime(1)).toBe('T2')
  })

  it('keeps the existing cache when the refresh fails', async () => {
    await refreshGuestCache(1, { fetcher: async () => ({ server_time: 'T1', full: true, results: [guest(1, 'Alice')] }) })
    await expect(refreshGuestCache(1, { fetcher: () => Promise.reject(new Error('offline')) })).rejects.toThrow('offline')
    expect(await getCachedGuests(1)).toHaveLength(1)
  })

  it('separates guest lists by event and finds guests by QR token', async () => {
    await refreshGuestCache(1, { fetcher: async () => ({ server_time: 'T', full: true, results: [guest(1, 'Alice')] }) })
    await refreshGuestCache(2, { fetcher: async () => ({ server_time: 'T', full: true, results: [guest(5, 'Eve')] }) })
    expect((await getCachedGuests(2)).map((g) => g.full_name)).toEqual(['Eve'])
    expect((await findGuestByQrToken(1, guest(1, '').qr_token.toUpperCase()))?.full_name).toBe('Alice')
    expect(await findGuestByQrToken(2, guest(1, '').qr_token)).toBeUndefined()
  })
})
