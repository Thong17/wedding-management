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
  start: 'top 22%',
  /**
   * The marker arrives when the road's bottom reaches here. Keep it the same % as `start` and the marker
   * stays at that height on screen while the road scrolls under it; a larger % makes it finish sooner.
   */
  end: 'bottom 22%',
  /** Seconds the marker takes to catch up with the scroll: 0 = glued to it, 1–2 = floaty. */
  scrub: 0.8,
}

const props = withDefaults(defineProps<{ items: { time: string; title: string }[]; active?: boolean }>(), { active: true })

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
function measure(): boolean {
  const box = root.value
  if (!box) return false
  const width = box.offsetWidth
  const height = box.offsetHeight
  const stops = stopCentres(box)
  const labelMin = Number.parseFloat(getComputedStyle(box).getPropertyValue('--label-min')) || 0
  const dot = box.querySelector<HTMLElement>('.dot')?.offsetWidth ?? 0
  inward.value = stops.map((stop, i) => (i % 2 ? width - stop.x : stop.x) - dot / 2 < labelMin)
  const next = roadPath(stops, width, height)
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
  const { gsap } = lib
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
    const timeline = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: root.value,
        scroller: scroller.value ?? undefined,
        start: SCROLL.start,
        end: SCROLL.end,
        scrub: SCROLL.scrub,
        onUpdate: (self) => {
          reached.value = stopAt.map((at) => self.progress >= at - 0.01)
          // The marker appears once the guest starts along this road (not parked at its corner before).
          if (marker.value) marker.value.style.opacity = self.progress > 0.002 ? '1' : '0'
        },
      },
    })
    timeline.to(path, { strokeDashoffset: 0 }, 0)
    timeline.to(marker.value, { motionPath: { path, align: path, alignOrigin: [0.5, 0.5] } }, 0)
  }, root.value)
}

// Redraw when the layout changes: screen width, language, fonts arriving, pictures above loading.
let observer: ResizeObserver | null = null
let pending = 0
function relayout() {
  cancelAnimationFrame(pending)
  pending = requestAnimationFrame(async () => {
    if (measure()) {
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
    observer = new ResizeObserver(relayout)
    observer.observe(root.value)
    const card = root.value.closest('.invite-card')
    if (card) observer.observe(card)
  }
})
watch(() => props.active, () => relayout())
watch(() => props.items, () => nextTick(relayout), { deep: true })
onBeforeUnmount(() => {
  observer?.disconnect()
  cancelAnimationFrame(pending)
  context?.revert()
})
</script>

<template>
  <div ref="root" class="road" :class="{ drawn: !!d }">
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
        :class="[i % 2 ? 'right' : 'left', { reached: showAll || reached[i], waiting: !showAll && !reached[i], inward: inward[i] }]"
      >
        <span class="dot">{{ i + 1 }}</span>
        <div class="stop-text">
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
  --stop-gap: 22px;
  /* Each stop's row is at least this tall (taller rows = longer, gentler bends). */
  --stop-height: 64px;
  /* The road before the first stop and after the last one. */
  --lead: 26px;
  /* Gap between a stop's dot and its time and title. */
  --label-gap: 26px;
  /* A stop's time and title go out to its side's edge, unless there is less room than this between
     the dot and the edge: then they go on the inner side of the dot (e.g. with stops near the edges). */
  --label-min: 130px;
  /* The numbered dot on the road. */
  --dot-size: 34px;
  /* The road: paved width, the gold verge on each side, the centre line's dashes (dash, gap). */
  --road-width: 6px;
  --road-verge: 2px;
  --road-dash: 7px 9px;
  /* The gold line drawn along the road as the guest scrolls, and the marker leading it. */
  --progress-width: 4px;
  --marker-size: 22px;
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
.road-dash { stroke: color-mix(in srgb, var(--gold) 75%, transparent); stroke-width: 2; stroke-dasharray: var(--road-dash); }
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
/* Stops sit left or right of the centre (on the road); their words go out to that side's edge,
   aligned to it, so nothing covers the road. */
.moment { position: relative; min-height: var(--stop-height); display: flex; align-items: center; }
.moment.left { padding-right: calc(100% - var(--stop-left) + var(--label-gap)); text-align: left; }
.moment.right { padding-left: calc(100% - var(--stop-right) + var(--label-gap)); justify-content: flex-end; text-align: right; }
/* Too little room outside the dot: the words go on its inner side, up to the other side's stops. */
.moment.left.inward {
  padding-left: calc(var(--stop-left) + var(--dot-size) / 2 + var(--label-gap));
  padding-right: calc(var(--stop-right) + var(--dot-size) / 2 + var(--label-gap));
}
.moment.right.inward {
  padding-right: calc(var(--stop-right) + var(--dot-size) / 2 + var(--label-gap));
  padding-left: calc(var(--stop-left) + var(--dot-size) / 2 + var(--label-gap));
}
.moment.left.inward .stop-text { align-items: flex-start; text-align: left; }
.moment.right.inward .stop-text { align-items: flex-end; text-align: right; }
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
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  transition: opacity var(--reveal-time) ease, transform var(--reveal-time) cubic-bezier(0.2, 0.7, 0.2, 1);
}
.moment.left .stop-text { align-items: flex-start; }
.moment.right .stop-text { align-items: flex-end; }
/* A stop's time and title wait, hidden, until the marker reaches it. */
.moment.waiting .stop-text { opacity: 0; transform: translateY(var(--reveal-rise)); }
.when { font-weight: 700; color: var(--gold); font-size: 0.9em; letter-spacing: 0.04em; white-space: nowrap; line-height: 1; }
.moment-title { font-size: 1.05em; line-height: 1; }
@media (prefers-reduced-motion: reduce) {
  .dot, .stop-text { transition: none; }
}
</style>
