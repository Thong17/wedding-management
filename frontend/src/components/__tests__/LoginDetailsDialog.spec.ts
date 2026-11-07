import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import LoginDetailsDialog from '@/components/LoginDetailsDialog.vue'

describe('LoginDetailsDialog', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('shows the login details and copies them as one message', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    vi.stubGlobal('isSecureContext', true)

    const w = mount(LoginDetailsDialog, {
      props: { details: { username: 'dara', password: 'Xy7kP2mQ' } },
      attachTo: document.body,
    })
    await flushPromises()
    const text = document.body.textContent ?? ''
    expect(text).toContain('Login created')
    expect(text).toContain(`${window.location.origin}/login`)
    expect(text).toContain('dara')
    expect(text).toContain('Xy7kP2mQ')

    const copy = [...document.body.querySelectorAll('button')].find((b) => b.textContent?.includes('Copy login details'))!
    copy.click()
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith(
      `Your login for Wedding Desk\nWebsite: ${window.location.origin}/login\nUsername: dara\nPassword: Xy7kP2mQ\n\nPlease change the password after signing in (Profile → Change password).`,
    )
    expect(document.body.textContent).toContain('Copied')
    w.unmount()
  })

  it('says "Password changed" after a reset', async () => {
    const w = mount(LoginDetailsDialog, {
      props: { details: { username: 'dara', password: 'p', reset: true } },
      attachTo: document.body,
    })
    await flushPromises()
    expect(document.body.textContent).toContain('Password changed')
    w.unmount()
  })
})
