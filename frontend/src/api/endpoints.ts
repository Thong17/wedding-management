import axios from 'axios'
import { API_URL, http, tokens } from './http'
import type {
  ApiAssignment,
  ApiEvent,
  ApiGift,
  ApiGuest,
  ApiManagedUser,
  ApiRole,
  ApiUser,
  EventInput,
  EventReport,
  GuestInput,
  GuestListResponse,
  ProfileUpdate,
  RoleInput,
  SyncItemPayload,
  SyncItemResult,
} from './types'

export const authApi = {
  async login(username: string, password: string): Promise<void> {
    const { data } = await axios.post(`${API_URL}/auth/token/`, { username, password }, { timeout: 15_000 })
    tokens.set(data.access, data.refresh)
  },
  me: () => http.get<ApiUser>('/auth/me/').then((r) => r.data),
  updateMe(update: ProfileUpdate) {
    const form = new FormData()
    if (update.username !== undefined) form.append('username', update.username)
    if (update.avatar) form.append('avatar', update.avatar, 'avatar.jpg')
    else if (update.avatar === null) form.append('remove_avatar', 'true')
    return http.patch<ApiUser>('/auth/me/', form).then((r) => r.data)
  },
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
  report: (id: number) => http.get<EventReport>(`/events/${id}/report/`).then((r) => r.data),
}

/** Customers on an event and their roles (client admins and the platform admin only). */
export const assignmentsApi = {
  list: (eventId: number) => http.get<ApiAssignment[]>(`/events/${eventId}/assignments/`).then((r) => r.data),
  add: (eventId: number, userId: number, roleId: number) =>
    http.post<ApiAssignment>(`/events/${eventId}/assignments/`, { user_id: userId, role_id: roleId }).then((r) => r.data),
  setRole: (eventId: number, id: number, roleId: number) =>
    http.patch<ApiAssignment>(`/events/${eventId}/assignments/${id}/`, { role_id: roleId }).then((r) => r.data),
  remove: (eventId: number, id: number) => http.delete(`/events/${eventId}/assignments/${id}/`),
}

export const rolesApi = {
  /** `client`: a client id (global roles + that client's), or 'global'. Omit for everything you can see. */
  list: (client?: number | 'global') =>
    http.get<ApiRole[]>('/roles/', { params: client != null ? { client } : undefined }).then((r) => r.data),
  create: (data: RoleInput) => http.post<ApiRole>('/roles/', data).then((r) => r.data),
  update: (id: number, data: Partial<RoleInput>) => http.patch<ApiRole>(`/roles/${id}/`, data).then((r) => r.data),
  remove: (id: number) => http.delete(`/roles/${id}/`),
}

export const usersApi = {
  /** Logins the signed-in admin can manage (a client admin sees only their own client's). */
  list: (params: { type?: 'client_admin' | 'customer'; client?: number | 'none'; active?: 0 | 1; search?: string } = {}) =>
    http.get<ApiManagedUser[]>('/users/', { params }).then((r) => r.data),
}

export const clientsApi = {
  list: () => http.get<{ id: number; business_name: string }[]>('/clients/').then((r) => r.data),
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
  update: (eventId: number, id: number, data: Partial<Pick<ApiGift, 'amount' | 'method' | 'item' | 'note'>> & { updated_at: string }) =>
    http.patch<ApiGift>(`/events/${eventId}/gifts/${id}/`, data).then((r) => r.data),
  void: (eventId: number, id: number, updatedAt: string) =>
    http.post<ApiGift>(`/events/${eventId}/gifts/${id}/void/`, { updated_at: updatedAt }).then((r) => r.data),
  sync: (transactions: SyncItemPayload[]) =>
    http.post<{ results: SyncItemResult[] }>('/gifts/sync/', { transactions }).then((r) => r.data),
}
