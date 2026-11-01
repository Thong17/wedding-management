import axios from 'axios'
import { API_URL, http, tokens } from './http'
import type {
  ApiEvent,
  ApiGift,
  ApiGuest,
  ApiMember,
  ApiUser,
  EventInput,
  EventReport,
  GuestInput,
  GuestListResponse,
  SyncItemPayload,
  SyncItemResult,
} from './types'

export const authApi = {
  async login(username: string, password: string): Promise<void> {
    const { data } = await axios.post(`${API_URL}/auth/token/`, { username, password }, { timeout: 15_000 })
    tokens.set(data.access, data.refresh)
  },
  me: () => http.get<ApiUser>('/auth/me/').then((r) => r.data),
  /** Unauthenticated reachability check; `navigator.onLine` does not prove the API is up. */
  async health(): Promise<boolean> {
    try {
      await axios.get(`${API_URL}/health/`, { timeout: 5_000 })
      return true
    } catch {
      return false
    }
  },
}

export const eventsApi = {
  list: () => http.get<ApiEvent[]>('/events/').then((r) => r.data),
  get: (id: number) => http.get<ApiEvent>(`/events/${id}/`).then((r) => r.data),
  create: (data: EventInput) => http.post<ApiEvent>('/events/', data).then((r) => r.data),
  update: (id: number, data: Partial<EventInput>) => http.patch<ApiEvent>(`/events/${id}/`, data).then((r) => r.data),
  remove: (id: number) => http.delete(`/events/${id}/`),
  members: (id: number) => http.get<ApiMember[]>(`/events/${id}/members/`).then((r) => r.data),
  addMember: (id: number, username: string, role: 'owner' | 'manager') =>
    http.post<ApiMember>(`/events/${id}/members/`, { username, role }).then((r) => r.data),
  removeMember: (id: number, userId: number) => http.delete(`/events/${id}/members/${userId}/`),
  report: (id: number) => http.get<EventReport>(`/events/${id}/report/`).then((r) => r.data),
}

export const guestsApi = {
  list: (eventId: number, updatedSince?: string) =>
    http
      .get<GuestListResponse>(`/events/${eventId}/guests/`, {
        params: updatedSince ? { updated_since: updatedSince } : undefined,
      })
      .then((r) => r.data),
  create: (eventId: number, data: GuestInput) =>
    http.post<ApiGuest>(`/events/${eventId}/guests/`, data).then((r) => r.data),
  update: (eventId: number, id: number, data: Partial<GuestInput>) =>
    http.patch<ApiGuest>(`/events/${eventId}/guests/${id}/`, data).then((r) => r.data),
  remove: (eventId: number, id: number) => http.delete(`/events/${eventId}/guests/${id}/`),
  importCsv: (eventId: number, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return http
      .post<{ created: number; errors: { row: number; errors: Record<string, string[]> }[] }>(
        `/events/${eventId}/guests/import/`,
        form,
      )
      .then((r) => r.data)
  },
}

export const giftsApi = {
  list: (eventId: number) => http.get<ApiGift[]>(`/events/${eventId}/gifts/`).then((r) => r.data),
  update: (eventId: number, id: number, data: Partial<Pick<ApiGift, 'amount' | 'method' | 'note'>> & { updated_at: string }) =>
    http.patch<ApiGift>(`/events/${eventId}/gifts/${id}/`, data).then((r) => r.data),
  void: (eventId: number, id: number, updatedAt: string) =>
    http.post<ApiGift>(`/events/${eventId}/gifts/${id}/void/`, { updated_at: updatedAt }).then((r) => r.data),
  sync: (transactions: SyncItemPayload[]) =>
    http.post<{ results: SyncItemResult[] }>('/gifts/sync/', { transactions }).then((r) => r.data),
}
