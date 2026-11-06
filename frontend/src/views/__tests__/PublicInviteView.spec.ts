import { flushPromises, mount } from '@vue/test-utils'
import { http as mswHttp, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { API_URL } from '@/api/http'
import { defaultConfig } from '@/invite/config'
import PublicInviteView from '@/views/PublicInviteView.vue'

vi.mock('@/invite/fonts', async (original) => ({
  ...(await original<typeof import('@/invite/fonts')>()),
  loadFonts: () => Promise.resolve(),
}))

const server = setupServer(mswHttp.all(`${API_URL}/*`, () => HttpResponse.error()))
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterAll(() => server.close())
afterEach(() => server.resetHandlers())
beforeEach(() => localStorage.clear())

function published(title = '') {
  const config = defaultConfig()
  Object.assign(config.content, { language: 'en', date: '2026-12-12' })
  Object.assign(config.content.text.en, { partner1: 'Sokha', partner2: 'Dara', title })
  return { ...config, images: {} }
}
const url = (slug: string) => `${API_URL}/public/invites/${slug}/`
const settle = async (wrapper: ReturnType<typeof mount>, selector: string) =>
  vi.waitFor(() => expect(wrapper.find(selector).exists()).toBe(true), { timeout: 5000 })

describe('PublicInviteView', () => {
  it('shows a published invitation without logging in, after a progress loader', async () => {
    server.use(
      mswHttp.get(url('sokha-dara'), ({ request }) => {
        expect(request.headers.get('authorization')).toBeNull()
        return HttpResponse.json(published())
      }),
    )
    const wrapper = mount(PublicInviteView, { props: { slug: 'sokha-dara' } })
    expect(wrapper.get('[role="progressbar"]').attributes('aria-label')).toBe('Preparing your invitation…')
    await settle(wrapper, '.cover')
    expect(wrapper.get('.cover').text()).toContain('Sokha & Dara')
    expect(document.title).toBe('Sokha & Dara · Wedding invitation')
  })

  it('says the invitation was not found for an unknown or unpublished link', async () => {
    server.use(mswHttp.get(url('nope'), () => HttpResponse.json({ detail: 'Invitation not found.' }, { status: 404 })))
    const wrapper = mount(PublicInviteView, { props: { slug: 'nope' } })
    await settle(wrapper, '[role="alert"]')
    expect(wrapper.get('[role="alert"] h1').text()).toBe('Invitation not found')
  })

  it('retries by itself when the network fails once', async () => {
    let calls = 0
    server.use(mswHttp.get(url('flaky'), () => (++calls === 1 ? HttpResponse.error() : HttpResponse.json(published()))))
    const wrapper = mount(PublicInviteView, { props: { slug: 'flaky' } })
    await settle(wrapper, '.cover')
    expect(calls).toBe(2)
  })

  it('offers a retry button after repeated failures', async () => {
    let calls = 0
    server.use(mswHttp.get(url('later'), () => (++calls <= 3 ? HttpResponse.error() : HttpResponse.json(published()))))
    const wrapper = mount(PublicInviteView, { props: { slug: 'later' } })
    await settle(wrapper, '.retry')
    await wrapper.get('.retry').trigger('click')
    await settle(wrapper, '.cover')
  })

  it('shows the copy saved on this phone at once, then the latest version', async () => {
    localStorage.setItem('wms.invite.seen', JSON.stringify(published('Old title')))
    server.use(mswHttp.get(url('seen'), () => HttpResponse.json(published('New title'))))
    const wrapper = mount(PublicInviteView, { props: { slug: 'seen' } })
    await settle(wrapper, '.cover')
    await vi.waitFor(() => expect(wrapper.get('.invite-card .title').text()).toBe('New title'))
    expect(JSON.parse(localStorage.getItem('wms.invite.seen')!).content.text.en.title).toBe('New title')
  })

  it('stops showing a saved copy once the invitation is unpublished', async () => {
    localStorage.setItem('wms.invite.gone', JSON.stringify(published()))
    server.use(mswHttp.get(url('gone'), () => HttpResponse.json({ detail: 'Invitation not found.' }, { status: 404 })))
    const wrapper = mount(PublicInviteView, { props: { slug: 'gone' } })
    await settle(wrapper, '[role="alert"]')
    expect(localStorage.getItem('wms.invite.gone')).toBeNull()
    await flushPromises()
  })
})
