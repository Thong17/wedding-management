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

/* ─── Tuning: the road's curve ───────────────────────────────────────────────────────────────────
 * Where the road goes is set by where the stops are (InviteRoad.vue, "Tuning" in its <style>); these
 * set how it curves between them. Each is a share (0–1) of the vertical distance being curved over.
 */
export const ROAD_CURVE = {
  /**
   * How round the bend between two stops is. 0 = straight lines from stop to stop, 0.3 = gentle
   * corners, 0.55 = smooth S-bends (default), 0.8 = deep swings that overshoot a little.
   */
  bend: 0.7,
  /**
   * The lead-in and lead-out (from the top centre to the first stop, and from the last stop to the
   * bottom centre): how long the road keeps going straight down before turning. 0.5 = an even curve,
   * 0.6 (default) = straight a little longer, 0.9 = drops nearly straight then turns sharply.
   */
  lead: 0.5,
}

/**
 * An SVG path through the stops in order: in from the top centre, an S-bend between each pair of
 * stops (control points straight below and above them, so the road leaves and enters each stop
 * vertically), and out to the bottom centre. `width` and `height` are the road's box.
 */
export function roadPath(stops: Point[], width: number, height: number, curve = ROAD_CURVE): string {
  if (!stops.length) return ''
  const r = (n: number) => Math.round(n * 10) / 10
  const centre = width / 2
  const first = stops[0]
  const last = stops[stops.length - 1]
  const { bend, lead } = curve
  let d = `M ${r(centre)} 0 C ${r(centre)} ${r(first.y * lead)}, ${r(first.x)} ${r(first.y * (1 - lead))}, ${r(first.x)} ${r(first.y)}`
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1]
    const b = stops[i]
    const drop = (b.y - a.y) * bend
    d += ` C ${r(a.x)} ${r(a.y + drop)}, ${r(b.x)} ${r(b.y - drop)}, ${r(b.x)} ${r(b.y)}`
  }
  const tail = height - last.y
  d += ` C ${r(last.x)} ${r(last.y + tail * (1 - lead))}, ${r(centre)} ${r(height - tail * lead)}, ${r(centre)} ${r(height)}`
  return d
}
