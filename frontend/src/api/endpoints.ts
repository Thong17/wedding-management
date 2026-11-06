import axios from 'axios'
import { API_URL, http, tokens } from './http'
import type {
  ApiAssignment,
  ApiClient,
  ApiClientDocument,
  ApiEvent,
  ApiGift,
  ApiInvite,
  ApiPublicInvite,
  ApiGuest,
  ApiManagedUser,
  ApiRole,
  ApiUser,
  ClientInput,
  DocumentInput,
  EventInput,
  EventReport,
  GuestInput,
  GuestListResponse,
  ManagedUserInput,
  ProfileUpdate,
  RoleInput,
  SyncItemPayload,
  SyncItemResult,
} from './types'
import type { InviteConfig } from '@/invite/config'

export const authApi = {
  async login(username: string, password: string): Promise<void> {
    const { data } = await axios.post(`${API_URL}/auth/token/`, { username, password }, { timeout: 15_000 })
    tokens.set(data.access, data.refresh)
  },
  me: () => http.get<ApiUser>('/auth/me/').then((r) => r.data),
  changePassword: (currentPassword: string, newPassword: string) =>
    http.post('/auth/password/', { current_password: currentPassword, new_password: newPassword }),
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
  create: (data: ManagedUserInput) => http.post<ApiManagedUser>('/users/', data).then((r) => r.data),
  update: (id: number, data: ManagedUserInput) => http.patch<ApiManagedUser>(`/users/${id}/`, data).then((r) => r.data),
  resetPassword: (id: number, password: string) => http.post(`/users/${id}/reset-password/`, { password }),
}

export const clientsApi = {
  list: (params: { status?: string; search?: string } = {}) => http.get<ApiClient[]>('/clients/', { params }).then((r) => r.data),
  get: (id: number) => http.get<ApiClient>(`/clients/${id}/`).then((r) => r.data),
  create: (data: ClientInput) => http.post<ApiClient>('/clients/', data).then((r) => r.data),
  update: (id: number, data: ClientInput) => http.patch<ApiClient>(`/clients/${id}/`, data).then((r) => r.data),
  remove: (id: number) => http.delete(`/clients/${id}/`),
}

/** A client's documents. Downloads go through the authenticated API: documents have no public link. */
export const documentsApi = {
  list: (clientId: number) => http.get<ApiClientDocument[]>(`/clients/${clientId}/documents/`).then((r) => r.data),
  create: (clientId: number, data: DocumentInput) =>
    http.post<ApiClientDocument>(`/clients/${clientId}/documents/`, documentForm(data)).then((r) => r.data),
  update: (clientId: number, id: number, data: Partial<DocumentInput>) =>
    http.patch<ApiClientDocument>(`/clients/${clientId}/documents/${id}/`, documentForm(data)).then((r) => r.data),
  remove: (clientId: number, id: number) => http.delete(`/clients/${clientId}/documents/${id}/`),
  download: (clientId: number, id: number) =>
    http.get<Blob>(`/clients/${clientId}/documents/${id}/download/`, { responseType: 'blob', timeout: 60_000 }).then((r) => r.data),
}

function documentForm(data: Partial<DocumentInput>): FormData {
  const form = new FormData()
  for (const [key, value] of Object.entries(data)) {
    if (value instanceof File) form.append(key, value)
    else if (value != null) form.append(key, String(value))
  }
  // Blank dates must be sent as empty strings to clear them.
  for (const key of ['issued_on', 'expires_on'] as const) if (key in data && data[key] == null) form.append(key, '')
  return form
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
  get: (eventId: number, id: number) => http.get<ApiGift>(`/events/${eventId}/gifts/${id}/`).then((r) => r.data),
  /**
   * What all desks on the event share: guests with gifts (id + count), the event-wide total of gifts not
   * voided, and the latest gifts, newest first.
   */
  deskFeed: (eventId: number) =>
    http
      .get<{
        marks: { guest: number; count: number }[]
        // Both left out (null / empty) for logins not allowed to see other desks' gifts.
        totals?: { count: number; total: string } | null
        recent: ApiGift[]
      }>(`/events/${eventId}/desk-feed/`)
      .then((r) => r.data),
  /** Every gift on the event from all desks, newest first (voided ones included), for the desk's tabs. */
  deskGifts: (eventId: number) => http.get<ApiGift[]>(`/events/${eventId}/desk-gifts/`).then((r) => r.data),
  update: (eventId: number, id: number, data: Partial<Pick<ApiGift, 'amount' | 'method' | 'item' | 'note'>> & { updated_at: string }) =>
    http.patch<ApiGift>(`/events/${eventId}/gifts/${id}/`, data).then((r) => r.data),
  void: (eventId: number, id: number, updatedAt: string) =>
    http.post<ApiGift>(`/events/${eventId}/gifts/${id}/void/`, { updated_at: updatedAt }).then((r) => r.data),
  sync: (transactions: SyncItemPayload[]) =>
    http.post<{ results: SyncItemResult[] }>('/gifts/sync/', { transactions }).then((r) => r.data),
}

/** The event's e-invite: the draft being designed, publishing it, and its pictures. */
export const invitesApi = {
  get: (eventId: number) => http.get<ApiInvite>(`/events/${eventId}/invite/`).then((r) => r.data),
  save: (eventId: number, data: { draft: InviteConfig; slug?: string | null; revision: number }) =>
    http.put<ApiInvite>(`/events/${eventId}/invite/`, data).then((r) => r.data),
  publish: (eventId: number, revision: number) =>
    http.post<ApiInvite>(`/events/${eventId}/invite/publish/`, { revision }).then((r) => r.data),
  unpublish: (eventId: number) => http.post<ApiInvite>(`/events/${eventId}/invite/unpublish/`).then((r) => r.data),
  uploadImage(eventId: number, image: Blob) {
    const form = new FormData()
    form.append('image', image, image.type === 'image/png' ? 'image.png' : 'image.jpg')
    return http.post<{ id: number; url: string }>(`/events/${eventId}/invite/images/`, form, { timeout: 60_000 }).then((r) => r.data)
  },
  /** A published invitation, for guests: no login, so not through the signed-in client. */
  public: (slug: string) =>
    axios.get<ApiPublicInvite>(`${API_URL}/public/invites/${encodeURIComponent(slug)}/`, { timeout: 15_000 }).then((r) => r.data),
}
