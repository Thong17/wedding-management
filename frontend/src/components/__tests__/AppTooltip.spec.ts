import { mount } from '@vue/test-utils'
import { TooltipProvider } from 'reka-ui'
import { describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import AppTooltip from '@/components/AppTooltip.vue'

const withTooltip = (text: string | null) =>
  defineComponent({
    render: () =>
      h(TooltipProvider, { delayDuration: 0 }, () =>
        h(AppTooltip, { text }, () => h('button', { class: 'trigger', 'aria-label': 'Refresh' }, '↻')),
      ),
  })

describe('AppTooltip', () => {
  it('shows its text when the element gets keyboard focus', async () => {
    const w = mount(withTooltip('Refresh guest list'), { attachTo: document.body })
    expect(document.body.textContent).not.toContain('Refresh guest list')
    await w.find('.trigger').trigger('focus')
    await nextTick()
    const tip = document.body.querySelector('.tooltip')
    expect(tip?.textContent).toContain('Refresh guest list')
    w.unmount()
  })

  it('leaves the element alone when there is no text', () => {
    const w = mount(withTooltip(null))
    expect(w.find('.trigger').exists()).toBe(true)
    expect(w.find('.trigger').attributes('data-state')).toBeUndefined()
  })
})
