<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { contrastOn, initials, type InviteConfig, type InviteImages, type InviteText } from '@/invite/config'
import type { InviteLabels } from '@/invite/labels'
import InviteEmblem from './InviteEmblem.vue'
import InviteParticles from './InviteParticles.vue'

/**
 * The invitation's cover, and the opening animation that takes it away. Tapping (or Enter / Space)
 * emits `open`; the parent then sets `mode` to 'opening', the animation plays, and `done` is emitted at
 * its end. 'closing' plays the same animation backwards (the cover comes back) and emits `closed`.
 * Styles: gatefold (two doors swing open in 3D), envelope (the flap lifts, the cover slides away),
 * fade. "Reduce motion" gets a short fade whatever the style.
 */
const props = defineProps<{
  config: InviteConfig
  /** The couple's names in the language shown. */
  names: Pick<InviteText, 'partner1' | 'partner2'>
  images: InviteImages
  labels: InviteLabels
  namesFont: string
  fontsReady: boolean
  mode: 'idle' | 'opening' | 'closing'
}>()
const emit = defineEmits<{ open: []; done: []; closed: [] }>()

const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
// How long each opening / closing takes (ms), matching the CSS below. The gatefold opens faster than it
// closes: the doors are gone well before the end of their swing, so the card is ready sooner.
const OPEN_DURATION = { gatefold: 1850, envelope: 2300, fade: 1500 } as const
const CLOSE_DURATION = { gatefold: 2300, envelope: 2300, fade: 1500 } as const

const anim = computed(() => props.config.animation)
const style = computed(() => (reduced ? 'reduced' : anim.value.style))
const coverImage = computed(() => (anim.value.cover_image != null ? props.images[String(anim.value.cover_image)] : null))
const emblemImage = computed(() => (anim.value.emblem_image != null ? props.images[String(anim.value.emblem_image)] : null))
const ink = computed(() => contrastOn(anim.value.cover_color))
const pair = computed(() => initials(props.names))
const names = computed(() => [props.names.partner1, props.names.partner2].filter(Boolean))
const moving = computed(() => props.mode !== 'idle')
// Gatefold: always two doors (the seal sits whole above where they meet, .seal-layer).
const leaves = computed(() =>
  style.value === 'gatefold' ? (['left', 'right'] as const) : (['whole'] as const),
)

let timer: ReturnType<typeof setTimeout> | undefined
watch(
  () => props.mode,
  (mode) => {
    clearTimeout(timer)
    if (mode === 'idle') return
    const ms = reduced ? 450 : (mode === 'opening' ? OPEN_DURATION : CLOSE_DURATION)[anim.value.style]
    timer = setTimeout(() => (mode === 'opening' ? emit('done') : emit('closed')), ms)
  },
  { immediate: true },
)
onBeforeUnmount(() => clearTimeout(timer))

/*
 * Envelope: the flap's point ends exactly at the seal's centre, so the seal always covers it whatever the
 * screen and however the names and lines above and below move the seal. Measured, and again on resize.
 */
const root = ref<HTMLElement | null>(null)
const flapTip = ref<number | null>(null)
function measureFlap() {
  const cover = root.value
  const seal = cover?.querySelector<HTMLElement>('.face .seal')
  if (!cover || !seal || style.value !== 'envelope' || !seal.offsetHeight) return
  // Layout offsets, not the on-screen box: those ignore the animations (the envelope sliding away, the
  // seal breathing), which would otherwise be measured into the flap.
  let top = seal.offsetHeight / 2
  for (let el: HTMLElement | null = seal; el && el !== cover; el = el.offsetParent as HTMLElement | null) top += el.offsetTop
  flapTip.value = Math.round(top)
}
let resizes: ResizeObserver | null = null
onMounted(() => {
  measureFlap()
  if (typeof ResizeObserver === 'undefined' || !root.value) return
  resizes = new ResizeObserver(() => measureFlap())
  resizes.observe(root.value)
  root.value.querySelectorAll('.face .center').forEach((el) => resizes!.observe(el))
})
watch([style, () => props.fontsReady, names], () => nextTick(measureFlap))
onBeforeUnmount(() => resizes?.disconnect())

function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    if (!moving.value) emit('open')
  }
}
</script>

<template>
  <div
    ref="root"
    class="cover"
    :class="[`style-${style}`, { opening: mode === 'opening', closing: mode === 'closing' }]"
    :style="{ '--flap-tip': flapTip != null ? `${flapTip}px` : undefined, '--cover': anim.cover_color, '--ink': ink, '--gold': config.design.accent }"
    role="button"
    tabindex="0"
    :aria-label="labels.tapToOpen"
    @click="!moving && emit('open')"
    @keydown="onKey"
  >
    <div v-for="leaf in leaves" :key="leaf" class="leaf" :class="`leaf-${leaf}`">
      <!-- The same face in every leaf; each gatefold door shows its half of it. -->
      <div class="panel">
      <div class="face">
        <div class="texture" />
        <img v-if="coverImage" class="cover-image" :src="coverImage" alt="" />
        <!-- The cover's frame, with the corner and top ornaments of the invitation's frame style (ornate.css);
             the corners sit as far from the border as on the card (design.ornate_spacing). -->
        <div class="frame" :style="{ '--ornate-spacing': config.design.ornate_spacing }"><span class="ornate-corners" /><span class="ornate-top" /></div>
        <!-- Envelope: the flap, under the seal that closes it. -->
        <div v-if="style === 'envelope'" class="flap" />
        <div class="center">
          <p class="eyebrow" :class="{ ready: fontsReady }">{{ labels.invitation }}</p>
          <!-- Gatefold: the seal is drawn whole above the doors (.seal-layer); here it only holds its place. -->
          <div class="seal" :class="{ placeholder: style === 'gatefold' }">
            <InviteEmblem
              :kind="anim.emblem"
              :initials="pair"
              :image-url="emblemImage"
              :accent="config.design.accent"
              :wax="anim.cover_color"
              :names-font="namesFont"
            />
          </div>
          <!-- Stacked like the card's: groom, &, bride. -->
          <p v-if="names.length" class="names" :class="{ ready: fontsReady }" :style="{ fontFamily: namesFont }">
            <template v-for="(name, i) in names" :key="i">
              <span v-if="i" class="amp">{{ labels.and }}</span>
              <span class="name">{{ name }}</span>
            </template>
          </p>
          <!-- Below the names: "cordially invite" (small), "our honoured guest" (large). -->
          <div class="guest" :class="{ ready: fontsReady }">
            <p class="guest-invite">{{ labels.greetingTitle }}</p>
            <p class="guest-title invite-frame invite-ornate">{{ labels.honouredGuest }}</p>
          </div>
        </div>
      </div>
        <!-- Gatefold: the front darkens as the door turns away from the light. -->
        <div v-if="leaf !== 'whole'" class="door-shade" />
      </div>
      <!-- Gatefold: a door is a slab, not a sheet: its inner edge (the thickness) and its back. -->
      <template v-if="leaf !== 'whole'">
        <div class="door-edge" />
        <div class="door-back"><span class="door-moulding" /></div>
      </template>
    </div>
    <!-- Gatefold: the seal sits whole over the seam between the doors, and sinks away before they open.
         Laid out exactly like the doors' faces (the other lines kept, invisible) so it sits in place. -->
    <div v-if="style === 'gatefold'" class="center seal-layer" aria-hidden="true">
      <p class="eyebrow">{{ labels.invitation }}</p>
      <div class="seal">
        <InviteEmblem
          :kind="anim.emblem"
          :initials="pair"
          :image-url="emblemImage"
          :accent="config.design.accent"
          :wax="anim.cover_color"
          :names-font="namesFont"
        />
      </div>
      <p v-if="names.length" class="names" :style="{ fontFamily: namesFont }">
        <template v-for="(name, i) in names" :key="i">
          <span v-if="i" class="amp">{{ labels.and }}</span>
          <span class="name">{{ name }}</span>
        </template>
      </p>
      <div class="guest">
        <p class="guest-invite">{{ labels.greetingTitle }}</p>
        <p class="guest-title invite-frame invite-ornate">{{ labels.honouredGuest }}</p>
      </div>
    </div>
    <InviteParticles v-if="anim.particles" :color="'#f0d488'" :burst="moving" />
    <p class="hint" :class="{ ready: fontsReady }">{{ labels.tapToOpen }}</p>
  </div>
</template>

<style scoped>
.cover {
  position: absolute;
  inset: 0;
  z-index: 5;
  cursor: pointer;
  perspective: 1300px;
  color: var(--ink);
  outline: none;
  -webkit-tap-highlight-color: transparent;
  /* How thick the gatefold doors are. */
  --door-depth: clamp(14px, 3.4cqi, 26px);
}
.cover:focus-visible .seal { filter: drop-shadow(0 0 14px var(--gold)); }

/* A leaf is the whole cover, or one gatefold door: a 3D slab whose front (.panel) shows its half of the
   face, with its inner edge and its back (only seen once it swings past side-on). */
.leaf { position: absolute; inset: 0; transform-style: preserve-3d; }
/* The doors overlap by 1px in the middle: two exact halves leave a hairline gap on screens whose width
   is an odd number of pixels (the half-pixel edges are blended with what is behind). Each face is the
   cover's full width (100cqi, the invitation's width), pinned to its outer side, so both line up exactly. */
.leaf-left { right: calc(50% - 1px); transform-origin: left center; }
.leaf-right { left: calc(50% - 1px); transform-origin: right center; }
.panel { position: absolute; inset: 0; overflow: hidden; backface-visibility: hidden; }
.face { position: absolute; inset: 0; background: var(--cover); }
.leaf-left .face { right: auto; width: 100cqi; }
.leaf-right .face { left: auto; width: 100cqi; }

/* The door's thickness: a strip at its inner edge, turned to face the opening, so it shows as the door
   swings: the cover color in deep shadow, with a gold trim along the front and back. */
.door-edge {
  position: absolute;
  top: 0;
  bottom: 0;
  width: var(--door-depth);
  background:
    linear-gradient(to right, var(--gold) 0 2px, transparent 2px calc(100% - 2px), var(--gold) calc(100% - 2px)),
    linear-gradient(to right, color-mix(in srgb, var(--cover) 55%, #000), color-mix(in srgb, var(--cover) 80%, #000) 50%, color-mix(in srgb, var(--cover) 45%, #000));
  backface-visibility: hidden;
}
/* Turned to face the gap between the doors (so it shows as they swing towards the guest), and set back
   by the door's thickness: the front stays where the cover was, the slab goes behind it. */
.leaf-left .door-edge { right: 0; transform-origin: right center; transform: translateZ(calc(var(--door-depth) * -1)) rotateY(90deg); }
.leaf-right .door-edge { left: 0; transform-origin: left center; transform: translateZ(calc(var(--door-depth) * -1)) rotateY(-90deg); }
/* The back of the door: darker, with a carved gold panel. */
.door-back {
  position: absolute;
  inset: 0;
  transform: translateZ(calc(var(--door-depth) * -1)) rotateY(180deg);
  backface-visibility: hidden;
  background:
    radial-gradient(ellipse at 50% 40%, rgb(255 255 255 / 0.06), transparent 70%),
    color-mix(in srgb, var(--cover) 70%, #000);
}
.door-moulding {
  position: absolute;
  inset: 9% 14%;
  border: 2px solid color-mix(in srgb, var(--gold) 55%, transparent);
  box-shadow: inset 0 0 0 6px color-mix(in srgb, var(--cover) 70%, #000), inset 0 0 0 7px color-mix(in srgb, var(--gold) 30%, transparent);
}
/* The seal above the doors (gatefold): only the seal shows; the rest only keeps it in place. */
.seal-layer { pointer-events: none; z-index: 3; }
.seal-layer .eyebrow, .seal-layer .names, .seal-layer .guest { visibility: hidden; }
.seal.placeholder { visibility: hidden; animation: none; }

/* Shadow falling on the front as the door turns away from the light. */
.door-shade { position: absolute; inset: 0; background: #000; opacity: 0; pointer-events: none; }
.leaf-left .door-shade { background: linear-gradient(to right, rgb(0 0 0 / 0.2), #000); }
.leaf-right .door-shade { background: linear-gradient(to left, rgb(0 0 0 / 0.2), #000); }

/* Velvet depth and a soft damask glow, so a plain color still looks rich. */
.texture {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse at 50% 42%, rgb(255 255 255 / 0.13), transparent 60%),
    radial-gradient(ellipse at 50% 120%, rgb(0 0 0 / 0.45), transparent 60%),
    repeating-radial-gradient(circle at 50% 50%, rgb(255 255 255 / 0.025) 0 2px, transparent 2px 9px);
}
/* Floral: the rings in the cover's text colour (dark on a light cover, light on a dark one), faintly, so
   they still show on a bright cover, where white ones vanish. */
.frames-floral .texture {
  background:
    radial-gradient(ellipse at 50% 42%, rgb(255 255 255 / 0.13), transparent 60%),
    radial-gradient(ellipse at 50% 120%, rgb(0 0 0 / 0.45), transparent 60%),
    repeating-radial-gradient(circle at 50% 50%, color-mix(in srgb, var(--ink) 2%, transparent) 0 2px, transparent 2px 9px);
}
.cover-image { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.cover-image + .frame::before {
  content: '';
  position: absolute;
  inset: -28px;
  background: linear-gradient(to bottom, rgb(0 0 0 / 0.15), rgb(0 0 0 / 0.45));
  z-index: -1;
}
.frame {
  position: absolute;
  inset: clamp(14px, 4%, 28px);
  border: 1px solid color-mix(in srgb, var(--gold) 75%, transparent);
  box-shadow: inset 0 0 0 5px color-mix(in srgb, var(--cover) 92%, transparent), inset 0 0 0 6px color-mix(in srgb, var(--gold) 45%, transparent);
  isolation: isolate;
}
/* The frame's ornaments, in the invitation's frame style. On the cover the "paper" is the cover colour. */
/* Above the envelope's flap, so the flap never hides the frame and its ornaments. */
.frame { --paper: var(--cover); z-index: 1; }
.frame .ornate-corners { --ornate-inset: 6px; --ornate-corner: clamp(34px, 10cqi, 64px); }
.frame .ornate-top { --ornate-top-scale: 2.2; }

.center {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: clamp(14px, 3vh, 26px);
  padding: 40px 24px;
  text-align: center;
}
/* The heading ("Wedding invitation"): large, across the top of the cover, above the seal and the names. */
.eyebrow {
  position: absolute;
  top: clamp(52px, 11%, 104px);
  left: 28px;
  right: 28px;
  margin: 0;
  font-family: 'Cormorant Garamond', 'Apple Khmer', 'Suwannaphum', serif;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  font-size: clamp(1.45rem, 6.5cqi, 2.5rem);
  line-height: 1.5;
  color: var(--gold);
  text-shadow: 0 2px 12px rgb(0 0 0 / 0.35);
}
.eyebrow:lang(km) { font-size: clamp(1.9rem, 8cqi, 2.9rem); line-height: 1.7; }
.seal { width: clamp(80px, 21vmin, 128px); aspect-ratio: 1; animation: seal-breathe 3.2s ease-in-out infinite; }
/* The names stacked as on the card (groom, &, bride); their size follows the names size setting. */
.names {
  margin: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.05em;
  line-height: 1.2;
  color: var(--ink);
  text-shadow: 0 2px 14px rgb(0 0 0 / 0.35);
}
.names .name { font-size: calc(clamp(1.8rem, 7.5cqi, 3rem) * var(--names-scale, 1)); font-weight: 500; }
.names .amp { font-size: calc(clamp(1.1rem, 4.2cqi, 1.7rem) * var(--names-scale, 1)); color: var(--gold); font-style: italic; }
/* Khmer stacks vowels and subscripts above and below the line: more room, so the lines don't overlap. */
.names:lang(km) { line-height: 1.75; gap: 0.2em; }
/* Below the names: a small "cordially invite", then "our honoured guest" large, in gold. */
.guest { display: flex; flex-direction: column; align-items: center; gap: 10px; }
/* "Our honoured guest" in an ornate frame of the invitation's style, on the cover colour. */
.guest-title.invite-frame {
  --paper: var(--cover);
  --ornate-corner: 16px;
  --ornate-inset: 4px;
  padding: 8px clamp(34px, 10cqi, 48px) 6px;
  /* Only the ornaments (corners and top): no border, card, line or shadow. */
  border: 0;
  background: none;
  box-shadow: none;
}
.guest p { margin: 0; font-family: 'Cormorant Garamond', 'Apple Khmer', 'Suwannaphum', serif; }
.guest-invite { font-size: clamp(0.85rem, 3.2cqi, 1.1rem); letter-spacing: 0.08em; color: color-mix(in srgb, var(--ink) 85%, transparent); }
.guest-title {
  font-size: clamp(1.4rem, 6cqi, 2.2rem);
  font-weight: 600;
  line-height: 1.5;
  letter-spacing: 0.04em;
  color: var(--gold);
  text-shadow: 0 2px 12px rgb(0 0 0 / 0.35);
}
.guest:lang(km) p { letter-spacing: 0; line-height: 1.8; }
.hint {
  position: absolute;
  left: 0;
  right: 0;
  bottom: clamp(36px, 8%, 64px);
  margin: 0;
  text-align: center;
  font-family: 'Cormorant Garamond', 'Apple Khmer', 'Suwannaphum', serif;
  font-size: 0.95rem;
  letter-spacing: 0.08em;
  color: color-mix(in srgb, var(--ink) 80%, transparent);
  animation: hint-pulse 2.4s ease-in-out infinite;
}
/* Text waits for its font so it never shows in a fallback first. */
.eyebrow, .names, .guest, .hint { opacity: 0; transition: opacity 0.6s ease; }
.eyebrow.ready, .names.ready, .guest.ready { opacity: 1; }
.hint.ready { opacity: 1; }
.opening .hint, .closing .hint { opacity: 0; transition-duration: 0.3s; }
.eyebrow:lang(km), .hint:lang(km) { letter-spacing: 0; text-transform: none; }

@keyframes seal-breathe {
  50% { transform: scale(1.035); filter: drop-shadow(0 0 18px color-mix(in srgb, var(--gold) 55%, transparent)); }
}
@keyframes hint-pulse { 50% { opacity: 0.45; } }

/* Gatefold: the emblem sinks away from the seam first; then the heavy doors swing open in 3D (darkening
   as they turn from the light) and, at the end of the swing, slide out past the sides while the cover
   fades, so nothing lingers. Total 1.85s (OPEN_DURATION.gatefold). */
.opening.style-gatefold .seal-layer .seal { animation: seal-sink 0.6s ease-in forwards; }
/* Two movements, each with one smooth curve, overlapping: the swing (rotate) and, starting partway
   through it, the slide out past the side (translate). Kept as separate properties so neither has to
   change pace to fit the other, which is what made a single keyframed movement feel jerky.
   Tune: the swing is DOOR_TURN, the slide starts at DOOR_SLIDE_AT and takes DOOR_SLIDE. */
.style-gatefold {
  --door-turn: 1.5s;
  --door-slide-at: 1.05s;
  --door-slide: 0.8s;
}
.opening.style-gatefold .leaf-left {
  animation:
    door-turn-left var(--door-turn) cubic-bezier(0.45, 0, 0.35, 1) 0.55s forwards,
    door-slide-left var(--door-slide) cubic-bezier(0.6, 0, 0.8, 0.6) var(--door-slide-at) forwards;
}
.opening.style-gatefold .leaf-right {
  animation:
    door-turn-right var(--door-turn) cubic-bezier(0.45, 0, 0.35, 1) 0.55s forwards,
    door-slide-right var(--door-slide) cubic-bezier(0.6, 0, 0.8, 0.6) var(--door-slide-at) forwards;
}
.opening.style-gatefold .door-shade { animation: door-shade var(--door-turn) cubic-bezier(0.45, 0, 0.35, 1) 0.55s forwards; }
/* Zoom: as the doors part, the view moves in through them (the cover grows), then it fades. */
.opening.style-gatefold {
  animation:
    cover-zoom 1.3s cubic-bezier(0.5, 0, 0.7, 1) 0.55s forwards,
    cover-out 0.45s ease-in 1.4s forwards;
}
@keyframes cover-zoom { to { transform: scale(1.2); } }
@keyframes seal-sink {
  to { opacity: 0; transform: translateY(28px) scale(0.9); }
}
@keyframes door-shade {
  60% { opacity: 0.55; }
  to { opacity: 0.7; }
}
@keyframes seal-flare {
  40% { transform: scale(1.12); filter: drop-shadow(0 0 30px var(--gold)) brightness(1.25); }
  100% { transform: scale(1.05); filter: drop-shadow(0 0 22px var(--gold)) brightness(1.1); }
}
/* The swing and the slide, as the rotate and translate properties (applied as translate, then rotate). */
@keyframes door-turn-left { from { rotate: y 0deg; } to { rotate: y -105deg; } }
@keyframes door-turn-right { from { rotate: y 0deg; } to { rotate: y 105deg; } }
@keyframes door-slide-left { from { translate: 0 0; } to { translate: -115% 0; } }
@keyframes door-slide-right { from { translate: 0 0; } to { translate: 115% 0; } }

/* Envelope: the flap lifts, the seal fades, and the envelope slides away below. */
.flap {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  /* Down to the seal's centre (measured), so the seal hides the point. */
  height: var(--flap-tip, 46%);
  background: linear-gradient(to bottom, color-mix(in srgb, var(--cover) 82%, #000), var(--cover));
  /* Full width down the sides, then two curved edges sweeping in to the point behind the seal. */
  clip-path: polygon(0 0, 100% 0, 100% 56%, 96.83% 59.94%, 93.59% 63.76%, 90.3% 67.45%, 86.94% 71.02%, 83.52% 74.47%, 80.04% 77.8%, 76.5% 81%, 72.9% 84.08%, 69.23% 87.04%, 65.51% 89.88%, 61.72% 92.59%, 57.88% 95.18%, 53.97% 97.65%, 50% 100%, 46.03% 97.65%, 42.12% 95.18%, 38.28% 92.59%, 34.49% 89.88%, 30.77% 87.04%, 27.1% 84.08%, 23.5% 81%, 19.96% 77.8%, 16.48% 74.47%, 13.06% 71.02%, 9.7% 67.45%, 6.41% 63.76%, 3.17% 59.94%, 0% 56%);
  transform-origin: top center;
  backface-visibility: hidden;
  filter: drop-shadow(0 6px 10px rgb(0 0 0 / 0.35));
}
.style-envelope .seal { position: relative; z-index: 2; }
.opening.style-envelope .seal { animation: seal-lift 0.5s ease-in forwards; }
.opening.style-envelope .flap { animation: flap-open 0.9s cubic-bezier(0.5, 0, 0.3, 1) 0.3s forwards; }
.opening.style-envelope .leaf-whole { animation: envelope-away 1.1s cubic-bezier(0.6, 0, 0.3, 1) 1.05s forwards; }
.opening.style-envelope { animation: cover-out 0.4s ease 1.9s forwards; }
@keyframes seal-lift { to { transform: scale(1.15); opacity: 0; } }
@keyframes flap-open { to { transform: rotateX(178deg); opacity: 0.4; } }
@keyframes envelope-away { to { transform: translateY(105%); } }

/* Fade: a glow, then the cover dissolves into light. */
.opening.style-fade .seal { animation: seal-flare 0.6s ease-out forwards; }
.opening.style-fade { animation: cover-dissolve 1s ease 0.45s forwards; }
@keyframes cover-dissolve { to { opacity: 0; transform: scale(1.08); filter: blur(6px) brightness(1.4); } }

.opening.style-reduced { animation: cover-out 0.4s ease forwards; }

/* Closing: each opening animation backwards, its start mirrored, so the cover comes back the way it left. */
.closing { cursor: default; }
/* Backing out through the doors as they close (curve mirrored, as it runs reversed: fast, then easing). */
.closing.style-gatefold {
  animation:
    cover-out 0.25s ease-out 0.05s reverse both,
    cover-zoom 1.4s cubic-bezier(0.65, 0, 0.8, 0.4) 0.05s reverse both;
}
/* Closing: the same two movements, with their own curves (curves given mirrored, as a reversed animation runs its curve backwards): the
   doors glide in from the sides, already turning, and swing shut with their weight, slowing as they meet. */
.closing.style-gatefold .leaf-left {
  animation:
    door-slide-left 0.8s cubic-bezier(0.6, 0, 0.8, 0.6) 0.05s reverse both,
    door-turn-left 1.65s cubic-bezier(0.7, 0, 0.45, 1) 0.05s reverse both;
}
.closing.style-gatefold .leaf-right {
  animation:
    door-slide-right 0.8s cubic-bezier(0.6, 0, 0.8, 0.6) 0.05s reverse both,
    door-turn-right 1.65s cubic-bezier(0.7, 0, 0.45, 1) 0.05s reverse both;
}
.closing.style-gatefold .door-shade { animation: door-shade 1.65s cubic-bezier(0.7, 0, 0.45, 1) 0.05s reverse both; }
.closing.style-gatefold .seal-layer .seal { animation: seal-sink 0.6s ease-out 1.7s reverse both; }
.closing.style-envelope { animation: cover-out 0.4s ease 0s reverse both; }
.closing.style-envelope .leaf-whole { animation: envelope-away 1.1s cubic-bezier(0.7, 0, 0.4, 1) 0.15s reverse both; }
.closing.style-envelope .flap { animation: flap-open 0.9s cubic-bezier(0.7, 0, 0.5, 1) 1.1s reverse both; }
.closing.style-envelope .seal { animation: seal-lift 0.5s ease-out 1.8s reverse both; }
.closing.style-fade { animation: cover-dissolve 1s ease 0.05s reverse both; }
.closing.style-fade .seal { animation: seal-flare 0.6s ease-in 0.9s reverse both; }
.closing.style-reduced { animation: cover-out 0.4s ease reverse both; }
@keyframes cover-out { to { opacity: 0; visibility: hidden; } }

@media (prefers-reduced-motion: reduce) {
  .seal, .hint { animation: none; }
}
</style>
