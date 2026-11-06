import axios from 'axios'
import { invitesApi } from '@/api/endpoints'
import type { ApiPublicInvite } from '@/api/types'
import { loadFonts } from './fonts'
import { withDefaults } from './config'

/**
 * Loading a guest's invitation so it never hangs: the request is retried with a short timeout, the
 * last copy is kept on the phone (shown at once next time while a fresh one is fetched), and fonts and
 * the first pictures are preloaded, each with a time limit, before the cover appears.
 */

const savedKey = (slug: string) => `wms.invite.${slug}`

export function readSaved(slug: string): ApiPublicInvite | null {
  try {
    const raw = localStorage.getItem(savedKey(slug))
    return raw ? (JSON.parse(raw) as ApiPublicInvite) : null
  } catch {
    return null
  }
}

export function save(slug: string, invite: ApiPublicInvite) {
  try {
    localStorage.setItem(savedKey(slug), JSON.stringify(invite))
  } catch {
    // storage full or blocked: the next visit just loads it again
  }
}

export function forget(slug: string) {
  try {
    localStorage.removeItem(savedKey(slug))
  } catch {
    // nothing saved
  }
}

/** A 404 means unknown or unpublished: no point retrying. */
export const isNotFound = (err: unknown) => axios.isAxiosError(err) && err.response?.status === 404

/** The published invitation, retried on network errors and timeouts (not on "not found"). */
export async function fetchInvite(slug: string, { attempts = 3, timeoutMs = 10_000 } = {}): Promise<ApiPublicInvite> {
  let last: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await invitesApi.public(slug, timeoutMs)
    } catch (err) {
      if (isNotFound(err)) throw err
      last = err
      if (i < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 800 * (i + 1)))
    }
  }
  throw last
}

/** Resolves when the picture is downloaded and decoded, or failed, or after `timeoutMs`: never hangs. */
export function preloadImage(url: string, timeoutMs = 8000): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image()
    const finish = () => {
      clearTimeout(timer)
      resolve()
    }
    const timer = setTimeout(finish, timeoutMs)
    img.onload = () => (img.decode ? img.decode().catch(() => undefined).then(finish) : finish())
    img.onerror = finish
    img.src = url
  })
}

/**
 * What the cover and the top of the card need, so they appear complete: the fonts, the cover picture,
 * the emblem and the couple photo. The gallery loads later, as guests scroll to it.
 */
export function firstAssets(invite: ApiPublicInvite): { fonts: () => Promise<void>; images: string[] } {
  const config = withDefaults(invite)
  const url = (id: number | null) => (id != null ? invite.images[String(id)] : undefined)
  const images = [
    config.animation.enabled ? url(config.animation.cover_image) : undefined,
    config.animation.enabled && config.animation.emblem === 'image' ? url(config.animation.emblem_image) : undefined,
    url(config.content.hero_photo),
  ].filter((u): u is string => !!u)
  return { fonts: () => loadFonts(config.design.font, 6000), images }
}
