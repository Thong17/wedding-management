import type { GiftMethod, GuestSide } from '@/offline/db'

export interface ApiUser {
  id: number
  username: string
  first_name: string
  last_name: string
  /** Absolute URL of the profile picture, or null. Missing on users cached before pictures existed. */
  avatar_url?: string | null
  /** Missing on users cached before accounts existed (treated as a customer until refreshed). */
  user_type?: UserType
  client?: { id: number; business_name: string } | null
  /** Why the login is locked, or null. */
  lock_reason?: 'suspended' | 'trial_ended' | null
  /** Last day of access (client trial, or a standalone customer's own date), or null. */
  access_ends_at?: string | null
}

export type UserType = 'platform_admin' | 'client_admin' | 'customer'

/** What a role can allow on an event (backend events.models.Permission). */
export type PermissionCode =
  | 'gift_desk'
  | 'gift_edit'
  | 'guest_add'
  | 'guest_edit'
  | 'guest_delete'
  | 'guest_import'
  | 'guest_export'
  | 'report_view'

export interface ApiRole {
  id: number
  name: string
  /** null for a global role. */
  client: number | null
  client_name: string | null
  permissions: PermissionCode[]
  usage_count: number
  updated_by_username: string | null
  updated_at: string
  /** Whether the signed-in user may change it. */
  editable: boolean
}

export type RoleInput = Pick<ApiRole, 'name' | 'permissions'> & { client?: number | null }

export interface ApiAssignment {
  id: number
  user_id: number
  username: string
  role_id: number
  role_name: string
  permissions: PermissionCode[]
  created_at: string
}

/** A login as the management pages list it (only the fields step 2 needs). */
export interface ApiManagedUser {
  id: number
  username: string
  first_name: string
  last_name: string
  is_active: boolean
  user_type: Exclude<UserType, 'platform_admin'>
  client: number | null
  client_name: string | null
}

export interface ProfileUpdate {
  username?: string
  /** New picture; `null` removes the current one. */
  avatar?: Blob | null
}

export interface ApiEvent {
  id: number
  name: string
  date: string
  venue: string
  currency: string
  /** Invitation QR base: a web link (e.g. Google Maps) or a bank KHQR string; '' for plain guest QRs. */
  invite_qr: string
  /** Owning client; null for events the platform admin runs directly. */
  client: number | null
  client_name: string | null
  /** Older field: "owner" = full access, "manager" = assigned. Prefer full_access / permissions. */
  role: 'owner' | 'manager' | null
  /** Client admins and the platform admin: edit/delete the event, assign people, every permission. */
  full_access: boolean
  /** What the signed-in user may do on this event. */
  permissions: PermissionCode[]
  created_at: string
  updated_at: string
}

export type EventInput = Pick<ApiEvent, 'name' | 'date' | 'venue' | 'currency' | 'invite_qr'> & { client?: number | null }

export interface ApiGuest {
  id: number
  event: number
  full_name: string
  nickname: string
  phone: string
  side: GuestSide
  group: string
  table_no: string
  qr_token: string
  is_deleted: boolean
  updated_at: string
}

export type GuestInput = Pick<ApiGuest, 'full_name' | 'nickname' | 'phone' | 'side' | 'group' | 'table_no'>

export interface GuestListResponse {
  server_time: string
  full: boolean
  results: ApiGuest[]
}

export interface ApiGift {
  id: number
  client_txn_id: string
  event: number
  guest: number | null
  guest_name: string
  walk_in_name: string
  /** null for an item gift. */
  amount: string | null
  currency: string
  method: GiftMethod
  item: string
  note: string
  client_created_at: string
  recorded_by_username: string
  received_at: string
  updated_at: string
  voided: boolean
}

export interface SyncItemPayload {
  client_txn_id: string
  event_id: number
  guest_id: number | null
  walk_in_name: string
  /** null for an item gift. */
  amount: string | null
  currency: string
  method: GiftMethod
  item: string
  note: string
  client_created_at: string
  device_id: string
}

export interface SyncItemResult {
  client_txn_id: string | null
  status: 'created' | 'duplicate' | 'rejected'
  gift_id?: number
  code?: string
  errors?: Record<string, unknown>
}

export interface EventReport {
  event_id: number
  currency: string
  /** All gifts, money and items. */
  count: number
  /** Money only: item gifts have no amount. */
  total: string | number
  by_method: { method: GiftMethod; count: number; total: string | null }[]
  by_side: { side: GuestSide; count: number; total: string | null }[]
  walk_in: { count: number; total: string | number }
  /** Item gifts, oldest first. */
  items: { guest_id: number | null; name: string; item: string }[]
  guests_total: number
  guests_with_gift: number
  by_guest: { id: number; full_name: string; side: GuestSide; group: string; gift_count: number; gift_total: string | null }[]
}
