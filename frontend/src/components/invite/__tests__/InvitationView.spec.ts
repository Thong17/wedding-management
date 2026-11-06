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

  it('shows the programme by part of the day, each with its place and map, then its numbered moments', () => {
    const c = config()
    c.animation.enabled = false
    const moment = (time: string, title: string) => ({ time, text: { km: { title: '' }, en: { title } } })
    const part = (title: string, date: string, place: string, maps_url: string, items: ReturnType<typeof moment>[]) => ({
      date,
      maps_url,
      text: { km: { title: '', place: '', address: '' }, en: { title, place, address: '' } },
      items,
    })
    c.content.timeline = [
      part('Morning', '2026-12-12', "Bride's home", 'https://maps.app.goo.gl/home', [moment('06:30', 'Guests arrive'), moment('07:00', 'Start')]),
      part('Evening', '2026-12-12', 'Sokha Hotel', '', [moment('17:00', 'Guests arrive')]),
    ]
    const wrapper = mount(InvitationView, { props: { config: c, images: {}, event } })
    const parts = wrapper.findAll('.part')
    expect(parts.map((p) => p.get('.part-title').text())).toEqual(['Morning', 'Evening'])
    expect(parts[0].get('.day').text()).toBe('Saturday, 12 December 2026')
    expect(parts[0].get('.part-place').text()).toContain("Bride's home")
    expect(parts[0].get('.moment-map a').attributes('href')).toBe('https://maps.app.goo.gl/home')
    expect(parts[1].find('.moment-map').exists()).toBe(false)
    const first = parts[0].findAll('.moment')
    expect(first.map((m) => [m.get('.dot').text(), m.get('.when').text(), m.get('.moment-title').text()])).toEqual([
      ['1', '6:30 AM', 'Guests arrive'],
      ['2', '7:00 AM', 'Start'],
    ])
    expect(parts[1].findAll('.moment').map((m) => m.get('.when').text())).toEqual(['5:00 PM'])
    // Without IntersectionObserver (this test browser) every part is simply shown.
    expect(wrapper.findAll('.reveal').every((el) => el.classes().includes('shown'))).toBe(true)
  })

  function withBankQrs() {
    const c = config()
    c.animation.enabled = false
    c.content.text.en.message = 'Your presence is the greatest gift.'
    c.content.bank_qrs = [{ image: 7, label: 'ABA · Sokha' }, { image: 8, label: '' }]
    const images = { '7': 'http://x/aba.png', '8': 'http://x/acleda.png' }
    return mount(InvitationView, { props: { config: c, images, event }, attachTo: document.body })
  }

  it('shows the bank QR codes below the message', () => {
    const wrapper = withBankQrs()
    const gift = wrapper.get('.gift')
    expect(gift.get('h2').text()).toBe('Wedding gift')
    const codes = gift.findAll('button.bank-qr')
    expect(codes.map((b) => b.get('img').attributes('src'))).toEqual(['http://x/aba.png', 'http://x/acleda.png'])
    expect(codes.map((b) => (b.find('.bank-label').exists() ? b.get('.bank-label').text() : ''))).toEqual(['ABA · Sokha', ''])
    // Right after the message.
    const html = wrapper.html()
    expect(html.indexOf('greatest gift')).toBeLessThan(html.indexOf('class="gift"'))
    wrapper.unmount()
  })

  it('opens a QR code in a dialog with its name, a reminder to check it, and saving', async () => {
    const wrapper = withBankQrs()
    await wrapper.findAll('button.bank-qr')[0].trigger('click')
    const dialog = wrapper.get('[role="dialog"]')
    expect(dialog.get('#qr-dialog-name').text()).toBe('ABA · Sokha')
    expect(dialog.get('.qr-image img').attributes('src')).toBe('http://x/aba.png')
    expect(dialog.get('.qr-note').text()).toContain('make sure the account name shown in your banking app is “ABA · Sokha”')

    // Saving: the picture as a file, through the share sheet where the phone has one.
    vi.useRealTimers()
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(new Blob(['png'], { type: 'image/png' })))
    const share = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { canShare: () => true, share })
    await dialog.get('.qr-btn.primary').trigger('click')
    await vi.waitFor(() => expect(share).toHaveBeenCalled())
    const shared = share.mock.calls[0][0] as { files: File[] }
    expect(fetchMock).toHaveBeenCalledWith('http://x/aba.png')
    expect(shared.files[0].name).toBe('ABA · Sokha.png')
    await vi.waitFor(() => expect(wrapper.get('.qr-btn.primary').text()).toBe('Saved'))

    await wrapper.get('.qr-backdrop').trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    delete (navigator as unknown as { canShare?: unknown }).canShare
    delete (navigator as unknown as { share?: unknown }).share
    wrapper.unmount()
  })

  it('asks to check the account name even when the code has no label, and downloads where sharing is missing', async () => {
    const wrapper = withBankQrs()
    await wrapper.findAll('button.bank-qr')[1].trigger('click')
    expect(wrapper.get('#qr-dialog-name').text()).toBe('Wedding gift')
    expect(wrapper.get('.qr-note').text()).toContain('check that the account name shown in your banking app is correct')
    vi.useRealTimers()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(new Blob(['png'], { type: 'image/png' })))
    URL.createObjectURL = vi.fn(() => 'blob:qr')
    URL.revokeObjectURL = vi.fn()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    await wrapper.get('.qr-btn.primary').trigger('click')
    await vi.waitFor(() => expect(click).toHaveBeenCalled())
    expect((click.mock.contexts[0] as HTMLAnchorElement).download).toBe('bank-qr.png')
    wrapper.unmount()
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
