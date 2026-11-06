import { flushPromises, mount } from '@vue/test-utils'
import { http as mswHttp, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
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

describe('PublicInviteView', () => {
  it('shows a published invitation without logging in', async () => {
    const config = defaultConfig()
    Object.assign(config.content, { language: 'en', partner1: 'Sokha', partner2: 'Dara', date: '2026-12-12' })
    server.use(
      mswHttp.get(`${API_URL}/public/invites/sokha-dara/`, ({ request }) => {
        expect(request.headers.get('authorization')).toBeNull()
        return HttpResponse.json({ ...config, images: {} })
      }),
    )
    const wrapper = mount(PublicInviteView, { props: { slug: 'sokha-dara' } })
    await flushPromises()
    expect(wrapper.get('.cover').text()).toContain('Sokha & Dara')
    expect(document.title).toBe('Sokha & Dara · Wedding invitation')
  })

  it('says the invitation was not found for an unknown or unpublished link', async () => {
    server.use(mswHttp.get(`${API_URL}/public/invites/nope/`, () => HttpResponse.json({ detail: 'Invitation not found.' }, { status: 404 })))
    const wrapper = mount(PublicInviteView, { props: { slug: 'nope' } })
    await flushPromises()
    expect(wrapper.get('[role="alert"] h1').text()).toBe('Invitation not found')
  })

  it('offers a retry when the server cannot be reached', async () => {
    let calls = 0
    server.use(
      mswHttp.get(`${API_URL}/public/invites/later/`, () => {
        calls++
        return calls === 1 ? HttpResponse.error() : HttpResponse.json({ ...defaultConfig(), images: {} })
      }),
    )
    const wrapper = mount(PublicInviteView, { props: { slug: 'later' } })
    await flushPromises()
    await wrapper.get('.retry').trigger('click')
    await flushPromises()
    expect(wrapper.find('.cover').exists()).toBe(true)
  })
})
