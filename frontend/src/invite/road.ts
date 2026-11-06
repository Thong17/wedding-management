import type { InjectionKey, Ref } from 'vue'

/**
 * The programme's road (InviteRoad): a winding path through each moment's stop, drawn as a road with
 * a dashed centre line, which a marker drives along as the guest scrolls.
 */

/** The element the invitation scrolls in (InvitationView's), for scroll-linked animation. */
export const INVITE_SCROLLER: InjectionKey<Ref<HTMLElement | null>> = Symbol('invite-scroller')

export interface Point {
  x: number
  y: number
}

/**
 * An SVG path through the stops in order: in from the top centre, an S-bend between each pair of
 * stops (control points straight below and above them, so the road leaves and enters each stop
 * vertically), and out to the bottom centre. `width` and `height` are the road's box.
 */
export function roadPath(stops: Point[], width: number, height: number): string {
  if (!stops.length) return ''
  const r = (n: number) => Math.round(n * 10) / 10
  const centre = width / 2
  const first = stops[0]
  const last = stops[stops.length - 1]
  let d = `M ${r(centre)} 0 C ${r(centre)} ${r(first.y * 0.6)}, ${r(first.x)} ${r(first.y * 0.4)}, ${r(first.x)} ${r(first.y)}`
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1]
    const b = stops[i]
    const bend = (b.y - a.y) * 0.55
    d += ` C ${r(a.x)} ${r(a.y + bend)}, ${r(b.x)} ${r(b.y - bend)}, ${r(b.x)} ${r(b.y)}`
  }
  const tail = height - last.y
  d += ` C ${r(last.x)} ${r(last.y + tail * 0.4)}, ${r(centre)} ${r(height - tail * 0.6)}, ${r(centre)} ${r(height)}`
  return d
}
