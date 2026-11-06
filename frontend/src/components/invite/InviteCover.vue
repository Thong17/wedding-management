<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue'
import { contrastOn, initials, type InviteConfig, type InviteImages } from '@/invite/config'
import type { InviteLabels } from '@/invite/labels'
import InviteEmblem from './InviteEmblem.vue'
import InviteParticles from './InviteParticles.vue'

/**
 * The invitation's cover, and the opening animation that takes it away. Tapping (or Enter / Space)
 * emits `open`; the parent then sets `opening`, the animation plays, and `done` is emitted at its end.
 * Styles: gatefold (two doors swing open in 3D), envelope (the flap lifts, the cover slides away),
 * fade. "Reduce motion" gets a short fade whatever the style.
 */
const props = defineProps<{
  config: InviteConfig
  images: InviteImages
  labels: InviteLabels
  namesFont: string
  fontsReady: boolean
  opening: boolean
}>()
const emit = defineEmits<{ open: []; done: [] }>()

const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
const DURATION = { gatefold: 2300, envelope: 2300, fade: 1500 } as const

const anim = computed(() => props.config.animation)
const style = computed(() => (reduced ? 'reduced' : anim.value.style))
const coverImage = computed(() => (anim.value.cover_image != null ? props.images[String(anim.value.cover_image)] : null))
const emblemImage = computed(() => (anim.value.emblem_image != null ? props.images[String(anim.value.emblem_image)] : null))
const ink = computed(() => contrastOn(anim.value.cover_color))
const pair = computed(() => initials(props.config.content))
const names = computed(() => [props.config.content.partner1, props.config.content.partner2].filter(Boolean))
// Gatefold: one whole face while closed (no seam through the seal), two doors once it opens.
const leaves = computed(() =>
  style.value !== 'gatefold' ? (['whole'] as const) : props.opening ? (['left', 'right'] as const) : (['whole'] as const),
)

let timer: ReturnType<typeof setTimeout> | undefined
watch(
  () => props.opening,
  (on) => {
    clearTimeout(timer)
    if (on) timer = setTimeout(() => emit('done'), reduced ? 450 : DURATION[anim.value.style])
  },
)
onBeforeUnmount(() => clearTimeout(timer))

function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    if (!props.opening) emit('open')
  }
}
</script>

<template>
  <div
    class="cover"
    :class="[`style-${style}`, { opening }]"
    :style="{ '--cover': anim.cover_color, '--ink': ink, '--gold': config.design.accent }"
    role="button"
    tabindex="0"
    :aria-label="labels.tapToOpen"
    @click="!opening && emit('open')"
    @keydown="onKey"
  >
    <div v-for="leaf in leaves" :key="leaf" class="leaf" :class="`leaf-${leaf}`">
      <!-- The same face in every leaf; each gatefold door shows its half of it. -->
      <div class="face">
        <div class="texture" />
        <img v-if="coverImage" class="cover-image" :src="coverImage" alt="" />
        <div class="frame"><span class="corner tl" /><span class="corner tr" /><span class="corner bl" /><span class="corner br" /></div>
        <!-- Envelope: the flap, under the seal that closes it. -->
        <div v-if="style === 'envelope'" class="flap" />
        <div class="center">
          <p class="eyebrow" :class="{ ready: fontsReady }">{{ labels.invitation }}</p>
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
          <p v-if="names.length" class="names" :class="{ ready: fontsReady }" :style="{ fontFamily: namesFont }">
            {{ names.join(` ${labels.and} `) }}
          </p>
        </div>
      </div>
    </div>
    <InviteParticles v-if="anim.particles" :color="'#f0d488'" :burst="opening" />
    <p class="hint" :class="{ ready: fontsReady }">{{ labels.tapToOpen }}</p>
  </div>
</template>

<style scoped>
.cover {
  position: absolute;
  inset: 0;
  z-index: 5;
  cursor: pointer;
  perspective: 1600px;
  color: var(--ink);
  outline: none;
  -webkit-tap-highlight-color: transparent;
}
.cover:focus-visible .seal { filter: drop-shadow(0 0 14px var(--gold)); }

.leaf { position: absolute; inset: 0; overflow: hidden; transform-style: preserve-3d; backface-visibility: hidden; }
.leaf-left { right: 50%; transform-origin: left center; }
.leaf-right { left: 50%; transform-origin: right center; }
.face { position: absolute; inset: 0; background: var(--cover); }
.leaf-left .face { right: -100%; }
.leaf-right .face { left: -100%; }

/* Velvet depth and a soft damask glow, so a plain color still looks rich. */
.texture {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse at 50% 42%, rgb(255 255 255 / 0.13), transparent 60%),
    radial-gradient(ellipse at 50% 120%, rgb(0 0 0 / 0.45), transparent 60%),
    repeating-radial-gradient(circle at 50% 50%, rgb(255 255 255 / 0.025) 0 2px, transparent 2px 9px);
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
.corner { position: absolute; width: 34px; height: 34px; border: 2px solid var(--gold); }
.corner.tl { top: 10px; left: 10px; border-right: 0; border-bottom: 0; }
.corner.tr { top: 10px; right: 10px; border-left: 0; border-bottom: 0; }
.corner.bl { bottom: 10px; left: 10px; border-right: 0; border-top: 0; }
.corner.br { bottom: 10px; right: 10px; border-left: 0; border-top: 0; }

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
.eyebrow {
  margin: 0;
  font-family: 'Cormorant Garamond', 'Battambang', serif;
  letter-spacing: 0.32em;
  text-transform: uppercase;
  font-size: clamp(0.72rem, 2.6vw, 0.9rem);
  color: var(--gold);
}
.seal { width: clamp(120px, 34vmin, 200px); aspect-ratio: 1; animation: seal-breathe 3.2s ease-in-out infinite; }
.names {
  margin: 0;
  font-size: clamp(1.6rem, 6vw, 2.6rem);
  line-height: 1.25;
  color: var(--ink);
  text-shadow: 0 2px 14px rgb(0 0 0 / 0.35);
}
.hint {
  position: absolute;
  left: 0;
  right: 0;
  bottom: clamp(36px, 8%, 64px);
  margin: 0;
  text-align: center;
  font-family: 'Cormorant Garamond', 'Battambang', serif;
  font-size: 0.95rem;
  letter-spacing: 0.08em;
  color: color-mix(in srgb, var(--ink) 80%, transparent);
  animation: hint-pulse 2.4s ease-in-out infinite;
}
/* Text waits for its font so it never shows in a fallback first. */
.eyebrow, .names, .hint { opacity: 0; transition: opacity 0.6s ease; }
.eyebrow.ready, .names.ready { opacity: 1; }
.hint.ready { opacity: 1; }
.opening .hint { opacity: 0; transition-duration: 0.3s; }
.eyebrow:lang(km), .hint:lang(km) { letter-spacing: 0.02em; text-transform: none; }

@keyframes seal-breathe {
  50% { transform: scale(1.035); filter: drop-shadow(0 0 18px color-mix(in srgb, var(--gold) 55%, transparent)); }
}
@keyframes hint-pulse { 50% { opacity: 0.45; } }

/* Gatefold: the seal flares, then the doors swing open in 3D and fade into the light. */
.opening.style-gatefold .seal { animation: seal-flare 0.7s ease-out forwards; }
.opening.style-gatefold .leaf-left { animation: door-left 1.7s cubic-bezier(0.6, 0.02, 0.2, 1) 0.45s forwards; }
.opening.style-gatefold .leaf-right { animation: door-right 1.7s cubic-bezier(0.6, 0.02, 0.2, 1) 0.45s forwards; }
.opening.style-gatefold { animation: cover-out 0.5s ease 1.8s forwards; }
@keyframes seal-flare {
  40% { transform: scale(1.12); filter: drop-shadow(0 0 30px var(--gold)) brightness(1.25); }
  100% { transform: scale(1.05); filter: drop-shadow(0 0 22px var(--gold)) brightness(1.1); }
}
@keyframes door-left {
  to { transform: rotateY(-108deg); box-shadow: 30px 0 60px rgb(0 0 0 / 0.5); }
}
@keyframes door-right {
  to { transform: rotateY(108deg); box-shadow: -30px 0 60px rgb(0 0 0 / 0.5); }
}

/* Envelope: the flap lifts, the seal fades, and the envelope slides away below. */
.flap {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: 46%;
  background: linear-gradient(to bottom, color-mix(in srgb, var(--cover) 82%, #000), var(--cover));
  clip-path: polygon(0 0, 100% 0, 50% 100%);
  transform-origin: top center;
  backface-visibility: hidden;
  filter: drop-shadow(0 6px 10px rgb(0 0 0 / 0.35));
}
.style-envelope .seal { position: relative; z-index: 2; }
/* The flap covers the top half: the eyebrow goes below the names instead. */
.style-envelope .eyebrow { order: 3; }
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
@keyframes cover-out { to { opacity: 0; visibility: hidden; } }

@media (prefers-reduced-motion: reduce) {
  .seal, .hint { animation: none; }
}
</style>
