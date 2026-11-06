import type { InviteConfig, InviteImages } from '@/invite/config'

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
  | 'gift_view_all'
  | 'gift_view_total'
  | 'gift_edit'
  | 'gift_edit_own'
  | 'gift_void'
  | 'gift_void_own'
  | 'invite_edit'
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
  user_type: UserType
  client: number | null
  client_name: string | null
  /** Own access end (standalone customers only). */
  trial_ends_at: string | null
  lock_reason: 'suspended' | 'trial_ended' | null
  is_platform_admin: boolean
  assignment_count: number
  last_login: string | null
  date_joined: string
}

export interface ManagedUserInput {
  username?: string
  first_name?: string
  last_name?: string
  is_active?: boolean
  password?: string
  /** Platform admin only. */
  user_type?: 'client_admin' | 'customer'
  client?: number | null
  trial_ends_at?: string | null
}

export type ClientStatus = 'trial' | 'active' | 'suspended'
export type BillingPeriod = 'monthly' | 'yearly' | 'per_event' | ''

export interface ApiClient {
  id: number
  business_name: string
  contact_name: string
  phone: string
  email: string
  address: string
  status: ClientStatus
  /** Last day of the trial (inclusive), or null for no end. */
  trial_ends_at: string | null
  subscription_price: string | null
  subscription_currency: string
  billing_period: BillingPeriod
  subscription_start: string | null
  notes: string
  /** Why its logins are locked right now, or null. */
  lock_reason: 'suspended' | 'trial_ended' | null
  admin_count: number
  customer_count: number
  event_count: number
  document_count: number
  created_at: string
  updated_at: string
}

export type ClientInput = Partial<Omit<ApiClient, 'id' | 'lock_reason' | 'admin_count' | 'customer_count' | 'event_count' | 'document_count' | 'created_at' | 'updated_at'>>

export type DocumentType = 'business_license' | 'id_card' | 'contract' | 'other'

export interface ApiClientDocument {
  id: number
  client: number
  doc_type: DocumentType
  number: string
  issued_on: string | null
  expires_on: string | null
  notes: string
  original_name: string
  content_type: string
  size: number | null
  uploaded_by_username: string | null
  uploaded_at: string
}

export interface DocumentInput {
  doc_type: DocumentType
  number: string
  issued_on: string | null
  expires_on: string | null
  notes: string
  file?: File
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

/** The editor's view of an event's e-invite (GET/PUT /events/<id>/invite/). */
export interface ApiInvite {
  /** The public link is /e-invite/<slug>; null until first published (or chosen). */
  slug: string | null
  status: 'draft' | 'published'
  /** Published, and the draft was changed since. */
  has_changes: boolean
  published_at: string | null
  /** Send back with every save / publish (409 if someone else saved meanwhile). */
  revision: number
  draft: InviteConfig
  /** Picture id → URL. */
  images: InviteImages
}

/** A published invitation, as guests get it (no login). Date and venue are already filled in. */
export type ApiPublicInvite = InviteConfig & { images: InviteImages }

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
  /** Who recorded it (user id), null if that login was deleted. */
  recorded_by: number | null
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
