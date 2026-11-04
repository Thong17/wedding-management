import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import GiftForm from '@/components/GiftForm.vue'

const mountForm = () =>
  mount(GiftForm, {
    props: { guest: null, currency: 'USD', eventId: 1, previousCount: 0, submit: vi.fn() },
  })

describe('GiftForm item presets', () => {
  it('fills the item with a common gift in one tap, still editable', async () => {
    const w = mountForm()
    const itemMethod = w.findAll('.method input').find((i) => (i.element as HTMLInputElement).value === 'item')!
    await itemMethod.setValue()

    const names = ['Gold', 'Ring', 'Necklace', 'Bracelet', 'Earrings', 'Watch', 'Rice cooker', 'Fridge', 'TV', 'Washing machine', 'Motorbike', 'Car', 'House', 'Land']
    const presets = w.findAll('button').filter((b) => names.includes(b.text()))
    expect(presets.map((b) => b.text())).toEqual(names)

    const ring = presets[1]
    await ring.trigger('click')
    const input = w.find('input[maxlength="200"][placeholder^="e.g."]')
    expect((input.element as HTMLInputElement).value).toBe('Ring')
    expect(ring.classes()).toContain('btn-primary')

    await input.setValue('Gold ring')
    expect(ring.classes()).not.toContain('btn-primary')
  })

  it('shows no item presets for money gifts', () => {
    expect(mountForm().text()).not.toContain('Necklace')
  })
})
