import { describe, expect, it } from 'vitest'
import { can, PERMISSIONS } from '@/utils/permissions'

describe('can()', () => {
  it('follows the role permissions, and full access allows everything', () => {
    const desk = { permissions: ['gift_desk'], full_access: false }
    expect(can(desk, 'gift_desk')).toBe(true)
    expect(can(desk, 'guest_import')).toBe(false)
    for (const p of PERMISSIONS) expect(can({ permissions: [], full_access: true }, p)).toBe(true)
  })

  it('treats events cached before roles existed as allowed, and no event as not allowed', () => {
    expect(can({}, 'gift_desk')).toBe(true)
    expect(can(null, 'gift_desk')).toBe(false)
  })
})
