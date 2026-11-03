import type { PermissionCode } from '@/api/types'

/** Every permission a role can include, in the order screens list them (matches backend Permission). */
export const PERMISSIONS: PermissionCode[] = [
  'gift_desk',
  'gift_edit',
  'guest_add',
  'guest_edit',
  'guest_delete',
  'guest_import',
  'guest_export',
  'report_view',
]

interface WithPermissions {
  permissions?: string[]
  full_access?: boolean
}

/**
 * Whether the signed-in user may do `perm` on an event. This only decides what the screen shows:
 * the server checks every action again. An event cached before roles existed has no permission
 * list, so it is treated as allowed until the next refresh rather than locking the offline desk.
 */
export function can(event: WithPermissions | null | undefined, perm: PermissionCode): boolean {
  if (!event) return false
  if (event.full_access) return true
  return event.permissions ? event.permissions.includes(perm) : true
}
