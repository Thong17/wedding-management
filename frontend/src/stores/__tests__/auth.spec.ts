import { http as mswHttp, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { createPinia, setActivePinia } from 'pinia'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { eventsApi } from '@/api/endpoints'
import { API_URL, tokens } from '@/api/http'
import { useAuthStore } from '@/stores/auth'
import { resetDB } from '@/test/helpers'

const me = (extra = {}) => ({ id: 1, username: 'bride_side', first_name: '', last_name: '', user_type: 'customer', client: { id: 3, business_name: 'Angkor Weddings' }, lock_reason: null, access_ends_at: null, ...extra })
let meBody = me()
const server = setupServer(
  mswHttp.get(`${API_URL}/auth/me/`, () => HttpResponse.json(meBody)),
  mswHttp.get(`${API_URL}/events/`, () => HttpResponse.json({ detail: 'This account is locked.', code: 'account_locked', reason: 'suspended' }, { status: 403 })),
)
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterAll(() => server.close())
afterEach(() => {
  server.resetHandlers()
  vi.useRealTimers()
})
beforeEach(async () => {
  await resetDB()
  localStorage.clear()
  tokens.set('access-1', 'refresh-1')
  localStorage.setItem('wms.user', JSON.stringify(me()))
  meBody = me()
  setActivePinia(createPinia())
})

describe('locked logins', () => {
  it('any request refused as locked turns the lock screen on, and it survives a reload', async () => {
    const auth = useAuthStore()
    expect(auth.lockReason).toBeNull()
    await expect(eventsApi.list()).rejects.toThrow()
    expect(auth.lockReason).toBe('suspended')
    expect(JSON.parse(localStorage.getItem('wms.user')!).lock_reason).toBe('suspended') // stays locked offline
  })

  it('checking again unlocks as soon as the server says so', async () => {
    localStorage.setItem('wms.user', JSON.stringify(me({ lock_reason: 'trial_ended' })))
    const auth = useAuthStore()
    expect(auth.lockReason).toBe('trial_ended')
    meBody = me({ lock_reason: null })
    await auth.refresh()
    expect(auth.lockReason).toBeNull()
  })

  it('counts the days left of access, with no count when locked or without an end date', async () => {
    vi.useFakeTimers({ now: new Date(2026, 10, 3, 15, 30), toFake: ['Date'] })
    localStorage.setItem('wms.user', JSON.stringify(me({ access_ends_at: '2026-11-05' })))
    expect(useAuthStore().daysLeft).toBe(2)
    setActivePinia(createPinia())
    localStorage.setItem('wms.user', JSON.stringify(me({ access_ends_at: '2026-11-03' })))
    expect(useAuthStore().daysLeft).toBe(0) // last day still works
    setActivePinia(createPinia())
    localStorage.setItem('wms.user', JSON.stringify(me({ access_ends_at: '2026-11-05', lock_reason: 'suspended' })))
    expect(useAuthStore().daysLeft).toBeNull()
    setActivePinia(createPinia())
    localStorage.setItem('wms.user', JSON.stringify(me()))
    expect(useAuthStore().daysLeft).toBeNull()
  })
})
