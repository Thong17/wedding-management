import { flushPromises, mount } from '@vue/test-utils'
import { http as mswHttp, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { TooltipProvider } from 'reka-ui'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { API_URL } from '@/api/http'
import type { ApiEvent, ApiInvite } from '@/api/types'
import InviteDesigner from '@/components/invite/InviteDesigner.vue'
import { defaultConfig } from '@/invite/config'

vi.mock('@/invite/fonts', async (original) => ({
  ...(await original<typeof import('@/invite/fonts')>()),
  loadFonts: () => Promise.resolve(),
}))
// Rendered outside a route here; the leave guard is the router's business.
vi.mock('vue-router', async (original) => ({ ...(await original<typeof import('vue-router')>()), onBeforeRouteLeave: vi.fn() }))

const server = setupServer(mswHttp.all(`${API_URL}/*`, () => HttpResponse.error()))
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterAll(() => server.close())
afterEach(() => server.resetHandlers())
beforeEach(() => {
  window.matchMedia ??= (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as never
})

const event = { id: 7, name: 'Sokha & Dara', date: '2026-12-12', venue: 'Sokha Hotel' } as ApiEvent

/** The designer as the app shows it: inside the tooltip provider App.vue sets up. */
const Designer = defineComponent(() => () => h(TooltipProvider, null, () => h(InviteDesigner, { event })))

function invite(over: Partial<ApiInvite> = {}): ApiInvite {
  const draft = defaultConfig()
  for (const lang of ['km', 'en'] as const) Object.assign(draft.content.text[lang], { partner1: 'Sokha', partner2: 'Dara' })
  return { slug: null, status: 'draft', has_changes: false, published_at: null, revision: 0, draft, images: {}, ...over }
}

describe('InviteDesigner', () => {
  it('saves the draft, then publishes it and shows the link to share', async () => {
    const saved: unknown[] = []
    const published: unknown[] = []
    server.use(
      mswHttp.get(`${API_URL}/events/7/invite/`, () => HttpResponse.json(invite())),
      mswHttp.put(`${API_URL}/events/7/invite/`, async ({ request }) => {
        const body = (await request.json()) as { draft: ApiInvite['draft']; revision: number }
        saved.push(body)
        return HttpResponse.json(invite({ draft: body.draft, revision: 1 }))
      }),
      mswHttp.post(`${API_URL}/events/7/invite/publish/`, async ({ request }) => {
        published.push(await request.json())
        return HttpResponse.json(invite({ status: 'published', slug: 'sokha-dara-ab12', revision: 2, draft: (saved[0] as { draft: ApiInvite['draft'] }).draft }))
      }),
    )
    const wrapper = mount(Designer, { attachTo: document.body })
    await flushPromises()

    expect(wrapper.get('.toolbar .badge').text()).toBe('Draft')
    const save = () => wrapper.findAll('.toolbar button').find((b) => b.text().includes('Save draft'))!
    expect(save().attributes('disabled')).toBeDefined() // nothing changed yet

    const title = wrapper.findAll('.panel label').find((l) => l.text().startsWith('Title'))!.get('input')
    await title.setValue('Our Wedding Day')
    expect(wrapper.get('.preview .title').text()).toBe('Our Wedding Day') // live preview, unsaved
    await save().trigger('click')
    await flushPromises()
    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({ revision: 0, draft: { content: { text: { km: { title: 'Our Wedding Day' } } } } })
    expect(save().attributes('disabled')).toBeDefined()

    await wrapper.findAll('.toolbar button').find((b) => b.text().includes('Publish'))!.trigger('click')
    await flushPromises()
    expect(published).toEqual([{ revision: 1 }])
    expect(wrapper.get('.toolbar .badge').text()).toBe('Published')
    expect((wrapper.get('.published .url').element as HTMLInputElement).value).toBe(`${location.origin}/e-invite/sokha-dara-ab12`)
    wrapper.unmount()
  })

  it('saves unsaved changes first when publishing', async () => {
    const calls: string[] = []
    server.use(
      mswHttp.get(`${API_URL}/events/7/invite/`, () => HttpResponse.json(invite({ revision: 3 }))),
      mswHttp.put(`${API_URL}/events/7/invite/`, () => {
        calls.push('save')
        return HttpResponse.json(invite({ revision: 4 }))
      }),
      mswHttp.post(`${API_URL}/events/7/invite/publish/`, async ({ request }) => {
        calls.push(`publish ${JSON.stringify(await request.json())}`)
        return HttpResponse.json(invite({ status: 'published', slug: 'x-1234', revision: 5 }))
      }),
    )
    const wrapper = mount(Designer, { attachTo: document.body })
    await flushPromises()
    await wrapper.findAll('.panel label').find((l) => l.text().startsWith('Title'))!.get('input').setValue('Hi')
    await wrapper.findAll('.toolbar button').find((b) => b.text().includes('Publish'))!.trigger('click')
    await flushPromises()
    expect(calls).toEqual(['save', 'publish {"revision":4}'])
    wrapper.unmount()
  })
})
