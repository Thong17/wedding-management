import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import AppConfirmHost from '@/components/AppConfirmHost.vue'
import { alertDialog, answerDialog, confirmDialog, currentDialog } from '@/utils/confirmDialog'

const buttons = () => [...document.body.querySelectorAll<HTMLButtonElement>('.confirm-actions button')]
const press = async (label: string) => {
  buttons().find((b) => b.textContent?.trim() === label)!.click()
  await flushPromises()
}

let host: VueWrapper | null = null
const mountHost = () => (host = mount(AppConfirmHost, { attachTo: document.body }))

describe('confirm and alert dialogs', () => {
  afterEach(() => {
    while (currentDialog.value) answerDialog(false)
    host?.unmount()
  })

  it('resolves true on the confirming button and false on Cancel', async () => {
    mountHost()
    const yes = confirmDialog({ message: 'Delete this guest?', confirmText: 'Delete', danger: true })
    await flushPromises()
    expect(document.body.textContent).toContain('Are you sure?')
    expect(document.body.textContent).toContain('Delete this guest?')
    expect(buttons().find((b) => b.textContent?.trim() === 'Delete')?.classList.contains('btn-danger')).toBe(true)
    await press('Delete')
    expect(await yes).toBe(true)

    const no = confirmDialog({ message: 'Log out?' })
    await flushPromises()
    await press('Cancel')
    expect(await no).toBe(false)
  })

  it('shows requests one after another', async () => {
    mountHost()
    const first = confirmDialog({ message: 'First?' })
    const second = alertDialog({ title: 'Install app', message: 'Tap Share.' })
    await flushPromises()
    expect(document.body.textContent).toContain('First?')
    await press('Confirm')
    expect(await first).toBe(true)
    expect(document.body.textContent).toContain('Tap Share.')
    expect(buttons().map((b) => b.textContent?.trim())).toEqual(['OK']) // an alert has no Cancel
    await press('OK')
    await expect(second).resolves.toBeUndefined()
  })
})
