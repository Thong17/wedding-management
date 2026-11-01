import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import GuestSearch from '@/components/GuestSearch.vue'
import type { CachedGuest } from '@/offline/db'
import { createGuestSearcher } from '@/offline/guestSearch'

const guests: CachedGuest[] = Array.from({ length: 23 }, (_, i) => ({
  eventId: 1,
  id: i + 1,
  full_name: `Guest ${String(i + 1).padStart(2, '0')}`,
  nickname: '',
  phone: '',
  side: 'both',
  group: '',
  table_no: '',
  qr_token: `t${i}`,
  updated_at: '',
}))

function mountSearch(query = '') {
  return mount(GuestSearch, {
    props: { searcher: createGuestSearcher(guests), giftedGuestIds: new Set<number | null>(), modelValue: query },
  })
}
const names = (w: ReturnType<typeof mountSearch>) => w.findAll('.results li strong').map((n) => n.text())

describe('GuestSearch pagination', () => {
  it('lists the first 10 guests by default', () => {
    const w = mountSearch()
    expect(names(w)).toEqual(guests.slice(0, 10).map((g) => g.full_name))
    expect(w.text()).toContain('Page 1 / 3')
    expect(w.text()).toContain('1–10 of 23')
  })

  it('pages forward and back', async () => {
    const w = mountSearch()
    const [prev, next] = w.findAll('.pager button')
    expect(prev.attributes('disabled')).toBeDefined()
    await next.trigger('click')
    await next.trigger('click')
    expect(names(w)).toEqual(['Guest 21', 'Guest 22', 'Guest 23'])
    expect(next.attributes('disabled')).toBeDefined()
    await prev.trigger('click')
    expect(names(w)[0]).toBe('Guest 11')
  })

  it('paginates search results and resets to page 1 when the query changes', async () => {
    const w = mountSearch()
    await w.findAll('.pager button')[1].trigger('click')
    await w.setProps({ modelValue: 'Guest 1' })
    expect(w.text()).not.toContain('Page 2 /')
    expect(w.text()).toContain('Page 1 /')
    expect(names(w)[0]).toBe('Guest 10') // exact substring matches rank first
  })

  it('selects a guest on click', async () => {
    const w = mountSearch()
    await w.findAll('.results li')[2].trigger('click')
    expect(w.emitted('select')?.[0]).toEqual([guests[2]])
  })
})
