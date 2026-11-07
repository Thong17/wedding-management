<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { InviteLabels } from '@/invite/labels'

/**
 * A gallery photo full size, over the whole invitation: above the card and the language / sound / close
 * buttons, so a tap anywhere on the dark backdrop only closes the photo. Fades and zooms in and out; the
 * photos cross-fade when stepping between them (buttons, arrow keys, or a swipe).
 */
const props = defineProps<{ photos: string[]; index: number | null; labels: InviteLabels }>()
const emit = defineEmits<{ close: []; step: [to: number] }>()

const box = ref<HTMLElement | null>(null)

/*
 * The phone browser colours its own top strip (behind the clock and battery, and on some phones the
 * address bar) from the page's theme-color and background, which are light: it would stay a bright line
 * above the dark backdrop. While a photo is open both are set to the backdrop's colour, then put back.
 */
const DARK = '#0a0406'
let saved: { meta: string | null; html: string; body: string } | null = null
function darkenBrowser(on: boolean) {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (on && !saved) {
    saved = { meta: meta?.content ?? null, html: document.documentElement.style.background, body: document.body.style.background }
    if (meta) meta.content = DARK
    document.documentElement.style.background = DARK
    document.body.style.background = DARK
  } else if (!on && saved) {
    if (meta && saved.meta != null) meta.content = saved.meta
    document.documentElement.style.background = saved.html
    document.body.style.background = saved.body
    saved = null
  }
}
onBeforeUnmount(() => darkenBrowser(false))
// Which way the last step went, so the photos slide that way.
const direction = ref(1)

watch(
  () => props.index,
  async (index, before) => {
    darkenBrowser(index != null)
    if (index != null && before == null) {
      await nextTick()
      box.value?.focus()
    }
  },
)

function step(by: number) {
  if (props.index == null || props.photos.length < 2) return
  direction.value = by
  emit('step', (props.index + by + props.photos.length) % props.photos.length)
}
function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close')
  else if (event.key === 'ArrowLeft') step(-1)
  else if (event.key === 'ArrowRight') step(1)
}

// Swipe left / right to step; a tap (no real movement) on the backdrop closes.
let touchX: number | null = null
function touchStart(event: TouchEvent) {
  touchX = event.touches[0]?.clientX ?? null
}
function touchEnd(event: TouchEvent) {
  if (touchX == null) return
  const moved = (event.changedTouches[0]?.clientX ?? touchX) - touchX
  touchX = null
  if (Math.abs(moved) > 40) step(moved < 0 ? 1 : -1)
}
</script>

<template>
  <Transition name="lightbox">
    <div
      v-if="index != null && photos[index]"
      ref="box"
      class="lightbox"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      @click.self="emit('close')"
      @keydown="onKey"
      @touchstart.passive="touchStart"
      @touchend="touchEnd"
    >
      <Transition :name="direction > 0 ? 'photo-next' : 'photo-prev'">
        <img :key="photos[index]" class="photo" :src="photos[index]" alt="" />
      </Transition>
      <button type="button" class="lb-close" :aria-label="labels.close" @click="emit('close')">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
      <template v-if="photos.length > 1">
        <button type="button" class="lb-prev" aria-label="‹" @click="step(-1)">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
        </button>
        <button type="button" class="lb-next" aria-label="›" @click="step(1)">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
        </button>
        <p class="lb-count">{{ index + 1 }} / {{ photos.length }}</p>
      </template>
    </div>
  </Transition>
</template>

<style scoped>
/* Over everything in the invitation (the language / sound / close buttons are z-index 6, the QR dialog 8). */
.lightbox {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgb(10 4 6 / 0.94);
  outline: none;
  overflow: hidden;
}
.photo {
  position: absolute;
  max-width: 92%;
  max-height: 84%;
  object-fit: contain;
  border-radius: var(--r-sm, 8px);
  box-shadow: 0 20px 60px rgb(0 0 0 / 0.5);
}
.lightbox button {
  position: absolute;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  min-height: 44px;
  padding: 0;
  border: 1px solid rgb(255 255 255 / 0.18);
  border-radius: 50%;
  corner-shape: round;
  background: rgb(255 255 255 / 0.1);
  color: #fff;
  cursor: pointer;
  transition: background 0.2s ease, transform 0.2s ease;
}
.lightbox button:hover { background: rgb(255 255 255 / 0.2); }
.lightbox button:active { transform: scale(0.94); }
.lightbox button svg { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.lb-close { top: max(12px, env(safe-area-inset-top)); right: 12px; }
.lb-prev { left: 12px; top: 50%; margin-top: -22px; }
.lb-next { right: 12px; top: 50%; margin-top: -22px; }
.lb-count {
  position: absolute;
  bottom: max(16px, env(safe-area-inset-bottom));
  left: 0;
  right: 0;
  margin: 0;
  text-align: center;
  color: rgb(255 255 255 / 0.7);
  font-size: 0.85rem;
  letter-spacing: 0.08em;
}

/* Opening and closing: the backdrop fades; the photo zooms up from a little smaller as it fades in. */
.lightbox-enter-active,
.lightbox-leave-active { transition: opacity 0.35s ease; }
.lightbox-enter-active .photo { transition: transform 0.45s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.35s ease; }
.lightbox-leave-active .photo { transition: transform 0.3s ease-in, opacity 0.3s ease; }
.lightbox-enter-from,
.lightbox-leave-to { opacity: 0; }
.lightbox-enter-from .photo,
.lightbox-leave-to .photo { transform: scale(0.9); opacity: 0; }

/* Stepping between photos: the old one slides out and fades as the new one slides in, in the direction of
   the step. */
.photo-next-enter-active,
.photo-next-leave-active,
.photo-prev-enter-active,
.photo-prev-leave-active { transition: transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.4s ease; }
.photo-next-enter-from { transform: translateX(40px) scale(0.98); opacity: 0; }
.photo-next-leave-to { transform: translateX(-40px) scale(0.98); opacity: 0; }
.photo-prev-enter-from { transform: translateX(-40px) scale(0.98); opacity: 0; }
.photo-prev-leave-to { transform: translateX(40px) scale(0.98); opacity: 0; }

@media (prefers-reduced-motion: reduce) {
  .lightbox-enter-active .photo,
  .lightbox-leave-active .photo,
  .photo-next-enter-active,
  .photo-next-leave-active,
  .photo-prev-enter-active,
  .photo-prev-leave-active { transition: opacity 0.2s ease; transform: none; }
}
</style>
