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
  Object.assign(c.content.text.en, { partner1: 'Sokha', partner2: 'Dara' })
  Object.assign(c.content.text.km, { partner1: 'សុខា', partner2: 'តារា', title: 'សិរីមង្គលអាពាហ៍ពិពាហ៍' })
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

  it('switches between English and Khmer with the language button', async () => {
    const c = config()
    c.animation.enabled = false
    const wrapper = mount(InvitationView, { props: { config: c, images: {}, event } })
    expect(wrapper.get('.invite-card').text()).toContain('Sokha')
    const lang = wrapper.get('button.lang')
    expect(lang.text()).toBe('ខ្មែរ')
    await lang.trigger('click')
    expect(wrapper.get('.invite-card').text()).toContain('សុខា')
    expect(wrapper.get('.invite-card').text()).toContain('ថ្ងៃសៅរ៍ ទី១២ ខែធ្នូ ឆ្នាំ២០២៦')
    expect(wrapper.get('.invitation').attributes('lang')).toBe('km')
    expect(wrapper.get('button.lang').text()).toBe('EN')
  })

  it('has a sound button unless the design has no sound at all', async () => {
    const c = config()
    const wrapper = mount(InvitationView, { props: { config: c, images: {}, event } })
    const sound = wrapper.find('button[aria-pressed]')
    expect(sound.exists()).toBe(true)
    expect(sound.attributes('aria-label')).toBe('Turn sound off')
    await sound.trigger('click') // no audio in the test browser: just the switch
    expect(wrapper.get('button[aria-pressed]').attributes('aria-label')).toBe('Turn sound on')
    expect(localStorage.getItem('wms.inviteSound')).toBe('off')
    localStorage.removeItem('wms.inviteSound')

    const silent = config()
    silent.audio.music = 'none'
    silent.audio.open_sound = false
    expect(mount(InvitationView, { props: { config: silent, images: {}, event } }).find('button[aria-pressed]').exists()).toBe(false)
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

  it('closes with the opening played backwards, and keeps particles behind the card while open', async () => {
    const wrapper = mount(InvitationView, { props: { config: config(), images: {}, event } })
    await flushPromises()
    expect(wrapper.find('.ambient').exists()).toBe(false) // the cover has its own
    await wrapper.get('.cover').trigger('click')
    vi.advanceTimersByTime(2300)
    await nextTick()
    expect(wrapper.find('.ambient').exists()).toBe(true)

    await wrapper.get('button.close').trigger('click')
    expect(wrapper.get('.cover').classes()).toContain('closing')
    vi.advanceTimersByTime(2300)
    await nextTick()
    expect(wrapper.emitted('closed')).toHaveLength(1)
    expect(wrapper.get('.cover').classes()).not.toContain('closing') // back on the cover, ready to open again
    expect(wrapper.find('button.close').exists()).toBe(false)
  })

  it('has no close button when the opening is turned off', () => {
    const c = config()
    c.animation.enabled = false
    const wrapper = mount(InvitationView, { props: { config: c, images: {}, event } })
    expect(wrapper.find('button.close').exists()).toBe(false)
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
