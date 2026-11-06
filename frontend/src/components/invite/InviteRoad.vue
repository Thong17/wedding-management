<script setup lang="ts">
import { inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { INVITE_SCROLLER, roadPath, type Point } from '@/invite/road'

/**
 * One part's moments as a winding road down the middle: the stops alternate a little left and right of
 * the centre, a road with a dashed centre line curves through them, and each stop's time and title sit
 * out at that side's edge, clear of the road. As the guest scrolls, a gold line is drawn along the road behind a
 * glowing marker, and each stop lights up as the marker reaches it (GSAP ScrollTrigger + MotionPath,
 * loaded only here). With "reduce motion" the road is simply drawn complete.
 *
 * The road is measured from where the stops actually land, so it follows any text length, language
 * and screen width, and is redrawn when they change.
 */
const props = withDefaults(defineProps<{ items: { time: string; title: string }[]; active?: boolean }>(), { active: true })

const scroller = inject(INVITE_SCROLLER, ref(null))
const root = ref<HTMLElement | null>(null)
const progressPath = ref<SVGPathElement | null>(null)
const marker = ref<HTMLElement | null>(null)
const size = ref({ w: 0, h: 0 })
const d = ref('')
const reached = ref<boolean[]>([])
const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** Where each stop's pin sits, from the layout, and the road through them. */
function measure(): boolean {
  const box = root.value
  if (!box) return false
  const base = box.getBoundingClientRect()
  const pins = [...box.querySelectorAll<HTMLElement>('.dot')]
  const stops: Point[] = pins.map((pin) => {
    const r = pin.getBoundingClientRect()
    return { x: r.left - base.left + r.width / 2, y: r.top - base.top + r.height / 2 }
  })
  const next = roadPath(stops, base.width, base.height)
  const changed = next !== d.value
  size.value = { w: base.width, h: base.height }
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
  if (!props.active || !path || !d.value || !size.value.w) return
  if (reduced) {
    reached.value = props.items.map(() => true)
    return
  }
  const lib = await loadGsap()
  if (!lib || !progressPath.value || !root.value) return
  const { gsap } = lib
  await nextTick()
  // How far along the road each stop sits, sampled from the path, so stops light up as the marker passes.
  const length = path.getTotalLength()
  const pins = [...root.value.querySelectorAll<HTMLElement>('.dot')]
  const base = root.value.getBoundingClientRect()
  const samples = Array.from({ length: 241 }, (_, i) => path.getPointAtLength((length * i) / 240))
  const stopAt = pins.map((pin) => {
    const r = pin.getBoundingClientRect()
    const x = r.left - base.left + r.width / 2
    const y = r.top - base.top + r.height / 2
    let best = 0
    samples.forEach((p, i) => {
      if (Math.hypot(p.x - x, p.y - y) < Math.hypot(samples[best].x - x, samples[best].y - y)) best = i
    })
    return best / 240
  })
  reached.value = stopAt.map(() => false)
  context = gsap.context(() => {
    gsap.set(path, { strokeDasharray: length, strokeDashoffset: length })
    const timeline = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: root.value,
        scroller: scroller.value ?? undefined,
        // From when the road's start nears the top of the screen until its end gets there: the marker
        // stays at about the same height on screen while the road passes under it, like driving.
        start: 'top 22%',
        end: 'bottom 22%',
        scrub: 0.8,
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
      <li v-for="(item, i) in items" :key="i" class="moment" :class="[i % 2 ? 'right' : 'left', { reached: reached[i] }]">
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
.road { position: relative; width: 100%; padding: 26px 0; }
.road-svg { position: absolute; inset: 0; overflow: visible; pointer-events: none; }
.road-svg path { fill: none; stroke-linecap: round; stroke-linejoin: round; }
/* The road: a soft gold verge, the paved surface, and the dashed centre line. */
.road-shoulder { stroke: color-mix(in srgb, var(--gold) 45%, transparent); stroke-width: 20; }
.road-surface { stroke: color-mix(in srgb, var(--paper) 72%, var(--ink) 10%); stroke-width: 16; }
.road-dash { stroke: color-mix(in srgb, var(--gold) 75%, transparent); stroke-width: 2; stroke-dasharray: 7 9; }
/* Drawn as the guest scrolls (GSAP): the stretch already travelled, in gold. */
.road-progress { stroke: var(--gold); stroke-width: 4; filter: drop-shadow(0 0 4px color-mix(in srgb, var(--gold) 70%, transparent)); }

.road-marker {
  position: absolute;
  top: 0;
  left: 0;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  corner-shape: round;
  background: radial-gradient(circle, #fff 0 22%, var(--gold) 26% 58%, color-mix(in srgb, var(--gold) 0%, transparent) 70%);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--gold) 25%, transparent), 0 0 18px var(--gold);
  pointer-events: none;
  z-index: 2;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.stops { list-style: none; margin: 0; padding: 0; position: relative; z-index: 1; display: flex; flex-direction: column; gap: 22px; }
/* Stops sit just left or right of the centre (on the road); their words go out to that side's edge,
   aligned to it, so nothing covers the road. */
.moment { position: relative; min-height: 64px; display: flex; align-items: center; }
.moment.left { padding-right: calc(60% + 26px); text-align: left; }
.moment.right { padding-left: calc(60% + 26px); justify-content: flex-end; text-align: right; }
.dot {
  position: absolute;
  top: 50%;
  width: 34px;
  height: 34px;
  margin-top: -17px;
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
.moment.left .dot { left: calc(40% - 17px); }
.moment.right .dot { right: calc(40% - 17px); }
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
  transition: transform 0.4s ease;
}
.moment.left .stop-text { align-items: flex-start; }
.moment.right .stop-text { align-items: flex-end; }
.when { font-weight: 700; color: var(--gold); font-size: 0.9em; letter-spacing: 0.04em; }
.moment-title { font-size: 1.05em; line-height: 1.35; }
.moment.left.reached .stop-text { transform: translateX(-3px); }
.moment.right.reached .stop-text { transform: translateX(3px); }
@media (prefers-reduced-motion: reduce) {
  .dot, .stop-text { transition: none; }
}
</style>
