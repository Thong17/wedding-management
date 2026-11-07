<script setup lang="ts">
import { inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { INVITE_SCROLLER, roadPath, type Point } from '@/invite/road'

/**
 * One part's moments as a winding road down the middle: the stops alternate a little left and right of
 * the centre, a road with a dashed centre line curves through them, and each stop's time and title sit
 * out at that side's edge, clear of the road. As the guest scrolls, a gold line is drawn along the road
 * behind a glowing marker; each stop lights up, and its time and title appear, as the marker reaches it
 * (GSAP ScrollTrigger + MotionPath, loaded only here). With "reduce motion", or if the animation can't
 * run, the road is simply drawn complete with every stop shown.
 *
 * Or, with variant "line", a straight line down the middle: the stops sit on it, their time and title
 * alternating either side, close to the line. Same drawing, marker and reveal.
 *
 * The road is measured from where the stops actually land, so it follows any text length, language
 * and screen width, and is redrawn when they change.
 *
 * ─── Where to tune it ──────────────────────────────────────────────────────────────────────────────
 *   Stop positions, spacing, sizes, road and marker look ...... "Tuning" at the top of <style> below
 *   When the scroll animation runs ............................ SCROLL, just below
 *   How the road curves between stops ......................... ROAD_CURVE in src/invite/road.ts
 */

/* ─── Tuning: when the scroll animation runs ───────────────────────────────────────────────────────
 * Positions are "<point of the road> <point of the screen>", e.g. 'top 22%' = when the road's top
 * reaches 22% down the screen. Percentages are of the screen height (0% = top, 100% = bottom).
 */
const SCROLL = {
  /** The marker sets off when the road's top reaches here. Lower % = starts earlier (road still low). */
  start: 'top 50%',
  /**
   * The marker arrives when the road's bottom reaches here. Keep it the same % as `start` and the marker
   * stays at that height on screen while the road scrolls under it; a larger % makes it finish sooner.
   */
  end: 'bottom 50%',
  /** Seconds the marker takes to catch up with the scroll: 0 = glued to it, 1–2 = floaty. */
  scrub: 0.8,
}
// The drawing only goes forward: scrolling back up leaves it where it got to, and once it has reached
// the end it stays complete. Kept across redraws (resize, language, fonts) so it never starts over.
let furthest = 0

const props = withDefaults(
  defineProps<{
    items: { time: string; title: string }[]
    variant?: 'road' | 'line'
    /** The boxes in the ornate gold frame, or a plain one. */
    ornate?: boolean
    active?: boolean
  }>(),
  { variant: 'road', ornate: true, active: true },
)

const scroller = inject(INVITE_SCROLLER, ref(null))
const root = ref<HTMLElement | null>(null)
const progressPath = ref<SVGPathElement | null>(null)
const marker = ref<HTMLElement | null>(null)
const size = ref({ w: 0, h: 0 })
const d = ref('')
const reached = ref<boolean[]>([])
// Without the scroll animation (reduce motion, no GSAP, nothing measured yet) every stop is shown.
const showAll = ref(true)
const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Where each stop's pin sits in the road's own (unscaled) coordinates. On screen the invitation may be
 * shown scaled down (the editor's phone / desktop previews), so on-screen positions are divided by
 * that scale: the road is drawn at full size, and must go through the stops at full size too.
 */
function stopCentres(box: HTMLElement): Point[] {
  const base = box.getBoundingClientRect()
  const scale = box.offsetWidth ? base.width / box.offsetWidth : 1
  return [...box.querySelectorAll<HTMLElement>('.dot')].map((pin) => {
    const r = pin.getBoundingClientRect()
    return { x: (r.left - base.left + r.width / 2) / scale, y: (r.top - base.top + r.height / 2) / scale }
  })
}

// Stops this close to the edge (less room than --label-min outside them) put their time and title on
// the inner side of the dot instead, so they don't have to wrap into a narrow strip.
const inward = ref<boolean[]>([])

/** Where the stops sit, which side their words go, and the road through them. */
/**
 * The straight line on a narrow screen (a phone): one line near the left edge, every stop on it, their
 * boxes to its right using the rest of the width (there is no room for boxes on both sides of a middle
 * line). Margins keep the dots and the boxes off the edges.
 */
const COMPACT_BELOW = 520
const compact = ref(false)

function measure(): boolean {
  const box = root.value
  if (!box) return false
  const width = box.offsetWidth
  const narrow = props.variant === 'line' && width < COMPACT_BELOW
  if (narrow !== compact.value) {
    // The stops move: measure again once they have.
    compact.value = narrow
    nextTick(() => relayout(true))
  }
  const height = box.offsetHeight
  const stops = stopCentres(box)
  const labelMin = Number.parseFloat(getComputedStyle(box).getPropertyValue('--label-min')) || 0
  const dot = box.querySelector<HTMLElement>('.dot')?.offsetWidth ?? 0
  // On the straight line the words always sit beside it, each side of the middle.
  inward.value = stops.map((stop, i) => props.variant === 'road' && (i % 2 ? width - stop.x : stop.x) - dot / 2 < labelMin)
  // The road comes in from, and goes out to, the middle; on the compact line, the line's own x (so it
  // stays straight).
  const next = roadPath(stops, compact.value && stops.length ? stops[0].x * 2 : width, height)
  const changed = next !== d.value
  size.value = { w: width, h: height }
  d.value = next
  return changed
}

// GSAP, set up once the road is drawn and redone when it changes shape.
type Gsap = typeof import('gsap').gsap
let gsapReady: Promise<{ gsap: Gsap; ScrollTrigger: typeof import('gsap/ScrollTrigger').ScrollTrigger } | null> | null = null
function loadGsap() {
  gsapReady ??= Promise.all([import('gsap'), import('gsap/ScrollTrigger'), import('gsap/MotionPathPlugin')])
    .then(([{ gsap }, { ScrollTrigger }, { MotionPathPlugin }]) => {
      gsap.registerPlugin(ScrollTrigger, MotionPathPlugin)
      return { gsap, ScrollTrigger }
    })
    .catch(() => null)
  return gsapReady
}
let context: { revert: () => void } | null = null

async function animate() {
  context?.revert()
  context = null
  const path = progressPath.value
  if (!props.active || !path || !d.value || !size.value.w || reduced) {
    showAll.value = true
    return
  }
  const lib = await loadGsap()
  if (!lib || !progressPath.value || !root.value) {
    showAll.value = true
    return
  }
  const { gsap, ScrollTrigger } = lib
  await nextTick()
  // How far along the road each stop sits, sampled from the path, so stops light up as the marker passes.
  const length = path.getTotalLength()
  const samples = Array.from({ length: 241 }, (_, i) => path.getPointAtLength((length * i) / 240))
  const stopAt = stopCentres(root.value).map(({ x, y }) => {
    let best = 0
    samples.forEach((p, i) => {
      if (Math.hypot(p.x - x, p.y - y) < Math.hypot(samples[best].x - x, samples[best].y - y)) best = i
    })
    return best / 240
  })
  reached.value = stopAt.map(() => false)
  showAll.value = false
  context = gsap.context(() => {
    gsap.set(path, { strokeDasharray: length, strokeDashoffset: length })
    // Played by hand (not scrubbed), so it can follow the scroll forward only.
    const timeline = gsap.timeline({ defaults: { ease: 'none' }, paused: true })
    timeline.to(path, { strokeDashoffset: 0 }, 0)
    timeline.to(marker.value, { motionPath: { path, align: path, alignOrigin: [0.5, 0.5] } }, 0)
    const show = (progress: number) => {
      reached.value = stopAt.map((at) => progress >= at - 0.01)
      // The marker appears once the guest starts along this road (not parked at its corner before).
      if (marker.value) marker.value.style.opacity = progress > 0.002 ? '1' : '0'
    }
    // Where it had got to before a redraw.
    timeline.progress(furthest)
    show(furthest)
    if (furthest >= 1) return
    const trigger = ScrollTrigger.create({
      trigger: root.value,
      scroller: scroller.value ?? undefined,
      // clamp(): a road near the top or the end of the invitation, which can't scroll as far as asked,
      // still plays in full within the scroll there is.
      start: `clamp(${SCROLL.start})`,
      end: `clamp(${SCROLL.end})`,
      onUpdate: (self) => {
        if (self.progress <= furthest) return
        furthest = self.progress
        show(furthest)
        // Glide to the new point (as the scrub did), then stop listening once at the end.
        gsap.to(timeline, { progress: furthest, duration: SCROLL.scrub, ease: 'power3.out', overwrite: true })
        if (furthest >= 1) trigger.kill()
      },
    })
  }, root.value)
}

// Redraw when the layout changes: screen width, language, fonts arriving, pictures above loading.
let observer: ResizeObserver | null = null
let pending = 0
/** Re-measure; rebuild the animation if the road changed shape, or when `rebuild` (e.g. just opened). */
function relayout(rebuild = false) {
  cancelAnimationFrame(pending)
  pending = requestAnimationFrame(async () => {
    if (measure() || rebuild) {
      await nextTick()
      await animate()
    } else {
      ;(await gsapReady)?.ScrollTrigger.refresh()
    }
  })
}
onMounted(async () => {
  await nextTick()
  measure()
  await nextTick()
  await animate()
  if (typeof ResizeObserver !== 'undefined' && root.value) {
    observer = new ResizeObserver(() => relayout())
    observer.observe(root.value)
    const card = root.value.closest('.invite-card')
    if (card) observer.observe(card)
  }
})
// Opened (the cover was in the way until now): set the animation up even if the road kept its shape.
watch(() => props.active, () => relayout(true))
watch(
  () => props.items,
  () => {
    furthest = 0
    nextTick(relayout)
  },
  { deep: true },
)
watch(() => props.variant, () => nextTick(() => relayout(true)))
onBeforeUnmount(() => {
  observer?.disconnect()
  cancelAnimationFrame(pending)
  context?.revert()
})
</script>

<template>
  <div ref="root" class="road" :class="[`variant-${variant}`, { drawn: !!d, compact }]">
    <svg v-if="d" class="road-svg" :viewBox="`0 0 ${size.w} ${size.h}`" :width="size.w" :height="size.h" aria-hidden="true">
      <path :d="d" class="road-shoulder" />
      <path :d="d" class="road-surface" />
      <path :d="d" class="road-dash" />
      <path ref="progressPath" :d="d" class="road-progress" />
    </svg>
    <span v-if="d && !reduced" ref="marker" class="road-marker" aria-hidden="true" />
    <ol class="stops">
      <li
        v-for="(item, i) in items"
        :key="i"
        class="moment"
        :class="[
          // On the compact line every stop is a left one with its box after the dot (as when turned inward).
          i % 2 && !compact ? 'right' : 'left',
          // The box is before (left of) the dot for left stops, unless turned inward; the reverse for right ones.
          !compact && (i % 2 === 1) === !!inward[i] ? 'box-before' : 'box-after',
          { reached: showAll || reached[i], waiting: !showAll && !reached[i], inward: inward[i] || compact },
        ]"
      >
        <span class="dot">{{ i + 1 }}</span>
        <div class="stop-text invite-frame" :class="{ 'invite-ornate': ornate }">
          <!-- The link from the dot: an ornamental arrow (fletching, a scrolled shaft, a leaf head), drawn
               pointing right on one centre line (y = 12), flipped when the box is left of the dot. -->
          <svg class="link" viewBox="0 0 120 24" aria-hidden="true">
            <g class="link-fill">
              <path d="M1 2.5 L8 2.5 L15.5 10.6 L8.5 10.6 Z M9 2.5 L16 2.5 L23.5 10.6 L16.5 10.6 Z" />
              <path d="M1 21.5 L8 21.5 L15.5 13.4 L8.5 13.4 Z M9 21.5 L16 21.5 L23.5 13.4 L16.5 13.4 Z" />
              <path d="M97 12 C 100 5.5, 108 5, 120 12 C 108 19, 100 18.5, 97 12 Z" />
            </g>
            <g class="link-stroke">
              <path d="M6 12 H 99" />
              <path d="M42 12 C 47 4.5, 56 4, 58.5 8.5 C 60 11.5, 56 12.5, 54.5 9.5" />
              <path d="M78 12 C 73 19.5, 64 20, 61.5 15.5 C 60 12.5, 64 11.5, 65.5 14.5" />
            </g>
          </svg>
          <span v-if="item.time" class="when">{{ item.time }}</span>
          <span class="moment-title">{{ item.title }}</span>
        </div>
      </li>
    </ol>
  </div>
</template>

<style scoped>
/* ─── Tuning: stops, road and marker ────────────────────────────────────────────────────────────────
 * Change these and look at the live preview: the road is redrawn through wherever the stops end up.
 */
.road {
  /* Stops alternate sides. Where each side's stops sit, measured from the box's left / right edge
     (percent of the width). 50% / 50% = all in the centre (a straight road); 40% / 40% (default) = a
     gentle weave in the middle; 25% / 25% = wide swings. They don't have to match. */
  --stop-left: 10%;
  --stop-right: 10%;
  /* Space between one stop and the next (the road's length between them). */
  --stop-gap: 44px;
  /* Each stop's row is at least this tall (taller rows = longer, gentler bends). */
  --stop-height: 84px;
  /* The road before the first stop and after the last one. */
  --lead: 26px;
  /* Gap between a stop's dot and the box with its time and title (the arrow spans it), and how far
     short of the dot the arrow's line stops. */
  --label-gap: 90px;
  --link-inset: 6px;
  /* How thick the arrow's shaft and curls are (in its drawing, which is 24 units tall). */
  --link-width: 2.6;
  /* Space inside the box, around the time and title (room for the corner flourishes), and how large
     those flourishes are. */
  --box-padding: 10px 16px;
  --box-corner: 13px;
  /* A stop's time and title go out to its side's edge, unless there is less room than this between
     the dot and the edge: then they go on the inner side of the dot (e.g. with stops near the edges). */
  --label-min: 130px;
  /* Words on the inner side of their dot keep at least this far from the other edge. */
  --label-edge: 12px;
  /* The numbered dot on the road. */
  --dot-size: 34px;
  /* The road: paved width, the gold verge on each side, the centre line's dashes (dash, gap). */
  --road-width: 4px;
  --road-verge: 1.5px;
  --road-dash: 5px 7px;
  /* The gold line drawn along the road as the guest scrolls, and the marker leading it. */
  --progress-width: 3px;
  --marker-size: 18px;
  /* How the time and title appear when the marker reaches their stop: from how far below, how long. */
  --reveal-rise: 10px;
  --reveal-time: 0.5s;

  position: relative;
  width: 100%;
  padding: var(--lead) 0;
}
.road-svg { position: absolute; inset: 0; overflow: visible; pointer-events: none; }
.road-svg path { fill: none; stroke-linecap: round; stroke-linejoin: round; }
/* The road: a soft gold verge, the paved surface, and the dashed centre line. */
.road-shoulder { stroke: color-mix(in srgb, var(--gold) 45%, transparent); stroke-width: calc(var(--road-width) + 2 * var(--road-verge)); }
.road-surface { stroke: color-mix(in srgb, var(--paper) 72%, var(--ink) 10%); stroke-width: var(--road-width); }
.road-dash { stroke: color-mix(in srgb, var(--gold) 75%, transparent); stroke-width: calc(var(--road-width) / 3); stroke-dasharray: var(--road-dash); }
/* Drawn as the guest scrolls (GSAP): the stretch already travelled, in gold. */
.road-progress { stroke: var(--gold); stroke-width: var(--progress-width); filter: drop-shadow(0 0 4px color-mix(in srgb, var(--gold) 70%, transparent)); }

.road-marker {
  position: absolute;
  top: 0;
  left: 0;
  width: var(--marker-size);
  height: var(--marker-size);
  border-radius: 50%;
  corner-shape: round;
  background: radial-gradient(circle, #fff 0 22%, var(--gold) 26% 58%, color-mix(in srgb, var(--gold) 0%, transparent) 70%);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--gold) 25%, transparent), 0 0 18px var(--gold);
  pointer-events: none;
  z-index: 2;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.stops { list-style: none; margin: 0; padding: 0; position: relative; z-index: 1; display: flex; flex-direction: column; gap: var(--stop-gap); }
/* Stops sit left or right of the centre (on the road). Each one's time and title are in a small bordered
   box beside its dot, --label-gap away, joined to the dot by a gold line with an arrow. The box goes on
   the outer side of the dot (towards that side's edge), or on the inner side when there is too little
   room outside (.inward); either way it sits right next to the dot, kept clear of the road. */
.moment { position: relative; min-height: var(--stop-height); display: flex; align-items: center; }
/* Box on the dot's outer side: it sits against the dot, and may use the width out to the edge. */
.moment.left { padding-right: calc(100% - var(--stop-left) + var(--dot-size) / 2 + var(--label-gap)); }
.moment.right { padding-left: calc(100% - var(--stop-right) + var(--dot-size) / 2 + var(--label-gap)); }
/* Box on the inner side: it may use the width up to --label-edge from the other edge. The other side's
   stops are in other rows, and the road only crosses over well above or below, so no room is kept. */
.moment.left.inward {
  padding-left: calc(var(--stop-left) + var(--dot-size) / 2 + var(--label-gap));
  padding-right: var(--label-edge);
}
.moment.right.inward {
  padding-right: calc(var(--stop-right) + var(--dot-size) / 2 + var(--label-gap));
  padding-left: var(--label-edge);
}
/* Which side of the dot the box is on: against the dot, with its text aligned towards it. */
.moment.box-before { justify-content: flex-end; }
.moment.box-after { justify-content: flex-start; }
.dot {
  position: absolute;
  top: 50%;
  width: var(--dot-size);
  height: var(--dot-size);
  margin-top: calc(var(--dot-size) / -2);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  corner-shape: round;
  background: var(--paper);
  border: 2px solid color-mix(in srgb, var(--gold) 60%, transparent);
  color: var(--gold);
  font-family: 'Cormorant Garamond', Georgia, serif;
  font-weight: 700;
  font-size: 0.85rem;
  transition: background 0.4s ease, color 0.4s ease, border-color 0.4s ease, transform 0.4s ease, box-shadow 0.4s ease;
}
.moment.left .dot { left: calc(var(--stop-left) - var(--dot-size) / 2); }
.moment.right .dot { right: calc(var(--stop-right) - var(--dot-size) / 2); }
.moment.reached .dot {
  background: var(--gold);
  border-color: var(--gold);
  color: var(--paper);
  transform: scale(1.1);
  box-shadow: 0 0 0 5px color-mix(in srgb, var(--gold) 22%, transparent);
}
.stop-text {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: fit-content;
  max-width: 100%;
  padding: var(--box-padding);
  /* The frame (border; with ornate, also the inner line, corners and diamond) is the shared .invite-frame. */
  --ornate-corner: var(--box-corner);
  border-radius: var(--r-sm, 10px);
  background-color: color-mix(in srgb, var(--paper) 92%, transparent);
  transition: opacity var(--reveal-time) ease, transform var(--reveal-time) cubic-bezier(0.2, 0.7, 0.2, 1);
}
.box-before .stop-text { align-items: flex-end; text-align: right; }
.box-after .stop-text { align-items: flex-start; text-align: left; }
/* The link from the dot to the box: the arrow across the gap, its head at the box. Its height follows
   its length (the drawing is 5:1), so it is never squashed. */
.link {
  position: absolute;
  top: 50%;
  width: calc(var(--label-gap) - var(--link-inset));
  aspect-ratio: 5;
  height: auto;
  color: var(--gold);
  overflow: visible;
  pointer-events: none;
}
.link-fill { fill: currentColor; }
.link-stroke { fill: none; stroke: currentColor; stroke-width: var(--link-width); stroke-linecap: round; }
.box-after .link { right: 100%; margin-right: 2px; transform: translateY(-50%); }
.box-before .link { left: 100%; margin-left: 2px; transform: translateY(-50%) scaleX(-1); }
/* A stop's box waits, hidden, until the marker reaches it. */
.moment.waiting .stop-text { opacity: 0; transform: translateY(var(--reveal-rise)); }
.when { font-weight: 700; color: var(--gold); font-size: 0.9em; letter-spacing: 0.04em; white-space: nowrap; line-height: 1; }
.moment-title { font-size: 1.05em; line-height: 1; }
@media (prefers-reduced-motion: reduce) {
  .dot, .stop-text { transition: none; }
}

/* ─── The straight line (variant "line") ─────────────────────────────────────────────────────────────
 * Every stop in the middle, so the path through them is a straight line; the words alternate sides,
 * aligned towards the line. Tune: the line's width (--line-width) and its colour below.
 */
.variant-line {
  --stop-left: 50%;
  --stop-right: 50%;
  --line-width: 2px;
  /* Less than the road's: here each side only has half the width. */
  --label-gap: 48px;
}
/* Compact (narrow screens): the line near the left edge, the boxes filling the width to its right, their
   text aligned left. --compact-margin keeps the dots and the boxes that far from the edges. */
.variant-line.compact {
  --compact-margin: 14px;
  --stop-left: calc(var(--compact-margin) + var(--dot-size) / 2);
  --label-edge: var(--compact-margin);
  --label-gap: 34px;
}
.variant-line.compact .moment.left { justify-content: stretch; }
.variant-line.compact .stop-text { width: 100%; align-items: flex-start; text-align: left; }
.variant-line .road-shoulder { stroke: color-mix(in srgb, var(--gold) 45%, transparent); stroke-width: var(--line-width); }
.variant-line .road-surface,
.variant-line .road-dash { display: none; }
.variant-line .road-progress { stroke-width: calc(var(--line-width) + 1px); }
</style>
