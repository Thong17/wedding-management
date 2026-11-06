import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import InvitationView from '@/components/invite/InvitationView.vue'
import { defaultConfig } from '@/invite/config'

// Fonts are files the test environment can't load: report them ready at once.
vi.mock('@/invite/fonts', async (original) => ({
  ...(await original<typeof import('@/invite/fonts')>()),
  loadFonts: () => Promise.resolve(),
}))

function config() {
  const c = defaultConfig()
  c.content.language = 'en'
  c.content.partner1 = 'Sokha'
  c.content.partner2 = 'Dara'
  c.content.time = '17:30'
  return c
}
const event = { date: '2026-12-12', venue: 'Sokha Hotel' }

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('InvitationView', () => {
  it('shows the cover first, opens on a tap, then shows the invitation', async () => {
    const wrapper = mount(InvitationView, { props: { config: config(), images: {}, event } })
    await flushPromises() // fonts ready
    const cover = wrapper.get('.cover')
    expect(cover.text()).toContain('Sokha & Dara')
    expect(cover.attributes('aria-label')).toBe('Tap to open the invitation')
    expect(wrapper.get('.stage').classes()).toContain('hidden')

    await cover.trigger('click')
    expect(wrapper.get('.cover').classes()).toContain('opening')
    vi.advanceTimersByTime(2300)
    await nextTick()

    expect(wrapper.find('.cover').exists()).toBe(false)
    expect(wrapper.emitted('opened')).toHaveLength(1)
    const card = wrapper.get('.invite-card')
    expect(card.text()).toContain('The Wedding Celebration') // default title while blank
    expect(card.text()).toContain('Saturday, 12 December 2026') // the event's date
    expect(card.text()).toContain('5:30 PM')
    expect(card.text()).toContain('Sokha Hotel') // the event's venue
  })

  it('opens with the keyboard too', async () => {
    const wrapper = mount(InvitationView, { props: { config: config(), images: {}, event } })
    await wrapper.get('.cover').trigger('keydown', { key: 'Enter' })
    expect(wrapper.get('.cover').classes()).toContain('opening')
  })

  it('goes straight to the invitation when the opening is turned off', () => {
    const c = config()
    c.animation.enabled = false
    const wrapper = mount(InvitationView, { props: { config: c, images: {}, event } })
    expect(wrapper.find('.cover').exists()).toBe(false)
    expect(wrapper.get('.invite-card').text()).toContain('Sokha')
  })

  it('can replay the opening (the editor preview starts open)', async () => {
    const wrapper = mount(InvitationView, { props: { config: config(), images: {}, event, startOpen: true } })
    expect(wrapper.find('.cover').exists()).toBe(false)
    ;(wrapper.vm as unknown as { replay: () => void }).replay()
    await nextTick()
    expect(wrapper.find('.cover').exists()).toBe(true)
  })

  it('shows uploaded photos and the gallery', async () => {
    const c = config()
    c.content.hero_photo = 1
    c.content.gallery = [1, 2]
    c.animation.enabled = false
    const images = { '1': 'http://x/1.jpg', '2': 'http://x/2.jpg' }
    const wrapper = mount(InvitationView, { props: { config: c, images, event } })
    expect(wrapper.get('.hero img').attributes('src')).toBe('http://x/1.jpg')
    expect(wrapper.findAll('.thumb img').map((i) => i.attributes('src'))).toEqual(['http://x/1.jpg', 'http://x/2.jpg'])
  })
})
