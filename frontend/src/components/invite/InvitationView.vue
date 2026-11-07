<script setup lang="ts">
import { computed, onBeforeUnmount, provide, ref, watch } from 'vue'
import { InviteAudio, saveSoundPreference, soundPreference, type SoundSettings } from '@/invite/audio'
import { viewIn, type InviteConfig, type InviteImages, type InviteLanguage } from '@/invite/config'
import { FONT_PAIRINGS, loadFonts } from '@/invite/fonts'
import { inviteLabels } from '@/invite/labels'
import { INVITE_SCROLLER } from '@/invite/road'
import '@/invite/ornate.css'
import InviteCard from './InviteCard.vue'
import InviteCover from './InviteCover.vue'
import InviteParticles from './InviteParticles.vue'
import InviteQrDialog from './InviteQrDialog.vue'

/**
 * The whole guest experience for one design: the cover, the opening animation, then the invitation.
 * The same component runs the public page, the editor's live preview and the Preview window, so what
 * the organizer sees is exactly what guests get. It fills its parent and lays out by the parent's
 * width (container queries), not the window's, so phone and desktop previews are real layouts.
 */
const props = withDefaults(
  defineProps<{
    config: InviteConfig
    images: InviteImages
    /** The event, for its date and venue where the design leaves them blank (public data has them). */
    event?: { date: string; venue: string } | null
    /** Start with the invitation open (the editor's side preview). */
    startOpen?: boolean
    /** Show it in this language (the editor shows the language being written); else the design's own. */
    language?: InviteLanguage | null
  }>(),
  { event: null, startOpen: false, language: null },
)
const emit = defineEmits<{ opened: []; closed: [] }>()

type Phase = 'cover' | 'opening' | 'open' | 'closing'
const phase = ref<Phase>(props.startOpen || !props.config.animation.enabled ? 'open' : 'cover')
// The invitation rises into view only when it is revealed by the opening, not when shown directly.
const revealing = ref(false)

// In English, a Khmer pairing switches to its Latin fonts (see FontPairing.latin).
const pairing = computed(() => {
  const fonts = FONT_PAIRINGS[props.config.design.font] ?? FONT_PAIRINGS.classic
  return language.value === 'en' && fonts.latin ? { ...fonts, ...fonts.latin } : fonts
})
// Guests can switch between Khmer and English; it opens in the design's language.
const language = ref<InviteLanguage>(props.language ?? props.config.content.language)
watch(
  () => props.language ?? props.config.content.language,
  (lang) => (language.value = lang),
)
function switchLanguage() {
  language.value = language.value === 'km' ? 'en' : 'km'
}
const labels = computed(() => inviteLabels(language.value))
const content = computed(() => viewIn(props.config, language.value, props.event))

// Sound: the chime as it opens and closes, and the background music. Created on the first tap (browsers
// allow sound only after one); the guest's on / off choice is kept on their phone.
const soundOn = ref(soundPreference())
const soundSettings = computed<SoundSettings>(() => {
  const audio = props.config.audio
  return {
    music: audio.music,
    songUrl: audio.music_file != null ? props.images[String(audio.music_file)] ?? null : null,
    volume: audio.volume,
    openSound: audio.open_sound,
  }
})
const hasSound = computed(() => props.config.audio.music !== 'none' || props.config.audio.open_sound)
let sound: InviteAudio | null = null
function soundEngine(): InviteAudio {
  sound ??= new InviteAudio(soundSettings.value, !soundOn.value)
  sound.unlock()
  return sound
}
watch(soundSettings, (settings) => sound?.update(settings), { deep: true })
function toggleSound() {
  soundOn.value = !soundOn.value
  saveSoundPreference(soundOn.value)
  const engine = soundEngine()
  engine.setMuted(!soundOn.value)
  if (soundOn.value && phase.value === 'open') engine.startMusic()
}
onBeforeUnmount(() => sound?.dispose())

const fontsReady = ref(false)
watch(
  () => props.config.design.font,
  async (font) => {
    fontsReady.value = false
    await loadFonts(font)
    fontsReady.value = true
  },
  { immediate: true },
)

// Turning the opening off (in the editor) shows the invitation straight away.
watch(
  () => props.config.animation.enabled,
  (on) => {
    if (!on) phase.value = 'open'
  },
)

/** The card zooms about a point a little above the middle of what is on screen (it is much taller). */
const zoomOrigin = ref('50% 40vh')
function aimZoom() {
  const el = scroll.value
  if (el) zoomOrigin.value = '50% ' + Math.round(el.scrollTop + el.clientHeight * 0.45) + 'px'
}
function open() {
  if (phase.value !== 'cover') return
  aimZoom()
  phase.value = 'opening'
  revealing.value = true
  if (hasSound.value) {
    const engine = soundEngine() // within the tap
    engine.playTransition(false, props.config.animation.style)
    engine.startMusic()
  }
}
function done() {
  phase.value = 'open'
  emit('opened')
}
/** The close button: the opening plays backwards and the cover comes back. */
function close() {
  if (phase.value !== 'open') return
  aimZoom()
  phase.value = 'closing'
  sound?.playTransition(true, props.config.animation.style)
}
const scroll = ref<HTMLElement | null>(null)
// The programme road animates with this scrolling (InviteRoad).
provide(INVITE_SCROLLER, scroll)
function closed() {
  revealing.value = false
  phase.value = 'cover'
  scroll.value?.scrollTo?.({ top: 0 })
  emit('closed')
}
/** Back to the cover at once, to watch the opening again. */
function replay() {
  revealing.value = false
  phase.value = props.config.animation.enabled ? 'cover' : 'open'
  scroll.value?.scrollTo?.({ top: 0 })
}
const coverMode = computed(() => (phase.value === 'opening' ? 'opening' : phase.value === 'closing' ? 'closing' : 'idle'))
// Once opened, the golden particles keep drifting behind the card (the cover has its own).
// They start once the doors are gone, so they don't compete with the opening for frames.
const backgroundParticles = computed(() => props.config.animation.enabled && props.config.animation.particles && (phase.value === 'open' || phase.value === 'closing'))
// A bank QR code tapped in the card, shown over the whole invitation.
const bankQr = ref<{ url: string; label: string } | null>(null)
defineExpose({ replay, close, phase, language })
</script>

<template>
  <div
    class="invitation"
    :class="[`card-${config.design.card_style}`, { 'fonts-ready': fontsReady }]"
    :style="{ '--paper': config.design.background, '--ink': config.design.text_color, '--gold': config.design.accent }"
    :lang="language"
  >
    <Transition name="particles">
      <div v-if="backgroundParticles" class="ambient" aria-hidden="true">
        <InviteParticles :color="config.design.accent" :count="60" :scale="1.6" />
      </div>
    </Transition>
    <div ref="scroll" class="scroll" :inert="phase === 'cover' || undefined">
      <div
        class="stage"
        :class="{ revealing, leaving: phase === 'closing', hidden: phase === 'cover' }"
        :style="{ transformOrigin: zoomOrigin }" @animationend.self="revealing = false">
        <InviteCard
          :config="config"
          :content="content"
          :images="images"
          :labels="labels"
          :names-font="pairing.names"
          :text-font="pairing.text"
          :active="phase !== 'cover'"
          :settled="phase === 'open'"
          @open-qr="bankQr = $event"
        />
      </div>
    </div>
    <InviteCover
      v-if="phase !== 'open'"
      :config="config"
      :names="content"
      :images="images"
      :labels="labels"
      :names-font="pairing.names"
      :fonts-ready="fontsReady"
      :mode="coverMode"
      @open="open"
      @done="done"
      @closed="closed"
    />
    <!-- Top right, over the cover and the card: language, sound, and (once open) close. -->
    <div class="controls">
      <button type="button" class="control lang" :aria-label="labels.switchLanguage" :title="labels.switchLanguage" @click="switchLanguage">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
        </svg>
        <span class="lang-name" :lang="language === 'km' ? 'en' : 'km'">{{ labels.otherLanguage }}</span>
      </button>
      <button
        v-if="hasSound"
        type="button"
        class="control"
        :aria-label="soundOn ? labels.soundOff : labels.soundOn"
        :aria-pressed="soundOn"
        :title="soundOn ? labels.soundOff : labels.soundOn"
        @click="toggleSound"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 9h4l5-4v14l-5-4H4z" />
          <template v-if="soundOn"><path d="M16.5 8.5a5 5 0 0 1 0 7" /><path d="M19 6a8.5 8.5 0 0 1 0 12" /></template>
          <path v-else d="M17 9l5 6M22 9l-5 6" />
        </svg>
      </button>
      <Transition name="close-btn">
        <button v-if="phase === 'open' && config.animation.enabled" type="button" class="control close" :aria-label="labels.close" :title="labels.close" @click="close">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </Transition>
    </div>
    <InviteQrDialog :qr="bankQr" :ornate="config.design.ornate_frames.includes('gifts')" :labels="labels" :text-font="pairing.text" @close="bankQr = null" />
  </div>
</template>

<style scoped>
/* Corner radii for everything in the invitation. Where the browser draws squircle corners (see
   style.css), they are larger, as a squircle curve reads tighter than a circular one. */
.invitation {
  --r-lg: 18px;
  --r-md: 14px;
  --r-sm: 8px;
  container: invite / inline-size;
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  isolation: isolate;
  /* Behind the card: the paper color, deepened toward the ink, with a soft light in the middle. */
  background:
    radial-gradient(ellipse at 50% 30%, color-mix(in srgb, var(--paper) 70%, #fff) 0%, transparent 65%),
    color-mix(in srgb, var(--paper) 86%, var(--ink));
  color: var(--ink);
}
.card-minimal { background: var(--paper); }
.scroll {
  position: absolute;
  inset: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  padding: clamp(16px, 5cqi, 56px) clamp(12px, 4cqi, 48px) clamp(32px, 8cqi, 80px);
}
.stage { opacity: 0; transition: opacity 0.5s ease; }
.fonts-ready .stage { opacity: 1; }
/* Hidden by opacity, not visibility, so the card is already drawn when the doors start to open (making
   it visible then would draw the whole card in the first frames of the opening). */
.stage.hidden { opacity: 0; }
/* Revealed by the opening: the card rises out of the light as the cover parts. */
/* Opacity and transform only: a filter (blur) on the whole card would be redrawn every frame and make the
   doors above it stutter. */
/* Zooming in: the card comes up from the bottom, small, and grows to its size as it arrives (about the
   middle of the screen, zoomOrigin). Closing plays it backwards: the card sinks and shrinks as it fades,
   while the doors close over it. Tune: the rise (--rise-from), how large it starts (--rise-scale), timing. */
.stage {
  --rise-from: 120px;
  --rise-scale: 0.8;
}
.stage.revealing { animation: card-rise 1.5s cubic-bezier(0.25, 0.7, 0.25, 1) 0.75s both; }
/* Reversed, so the curve is given mirrored: in time it starts slowly and speeds away. */
.stage.leaving { animation: card-rise 1s cubic-bezier(0.2, 0.6, 0.5, 1) reverse both; }
@keyframes card-rise {
  from { opacity: 0; transform: translateY(var(--rise-from)) scale(var(--rise-scale)); }
  40% { opacity: 1; }
}
@supports (corner-shape: squircle) {
  .invitation { --r-lg: 32px; --r-md: 24px; --r-sm: 14px; }
}

/* Golden particles behind the card once it is open. */
.ambient { position: absolute; inset: 0; z-index: 0; pointer-events: none; }
.scroll { z-index: 1; }
.particles-enter-active { transition: opacity 1.6s ease 0.8s; }
.particles-leave-active { transition: opacity 0.6s ease; }
.particles-enter-from, .particles-leave-to { opacity: 0; }

/* Controls: gold-rimmed buttons in the top corner, over the cover and the card. */
.controls {
  position: absolute;
  z-index: 6;
  top: max(12px, env(safe-area-inset-top));
  right: 12px;
  display: flex;
}
/* Spacing as a margin rather than gap, so the close button can grow its space smoothly (below). */
.control + .control { margin-left: 8px; }
.control {
  height: 44px;
  min-width: 44px;
  min-height: 44px;
  padding: 0 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border-radius: 999px;
  corner-shape: round;
  border: 1px solid color-mix(in srgb, var(--gold) 80%, transparent);
  background: color-mix(in srgb, var(--paper) 82%, transparent);
  backdrop-filter: blur(6px);
  color: var(--ink);
  box-shadow: 0 6px 18px rgb(0 0 0 / 0.18);
  cursor: pointer;
  transition: transform 0.2s ease, background 0.2s ease;
}
.control:hover { background: var(--paper); transform: translateY(-1px); }
.control:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }
.control svg { width: 20px; height: 20px; flex-shrink: 0; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
.lang-name { font-family: 'Battambang', 'Noto Serif Khmer', 'Cormorant Garamond', Georgia, serif; font-size: 0.85rem; font-weight: 400; line-height: 1; }
.lang-name:lang(en) { font-weight: 600; letter-spacing: 0.04em; }
.lang-name:lang(km) { font-size: 1rem; line-height: 1.4; }
/* The close button opens up its space first, gliding the other buttons to the left, then fades in;
   leaving, it fades, then its space closes and they glide back. */
.close { width: 44px; min-width: 0; overflow: hidden; }
.close-btn-enter-active {
  transition:
    width 0.35s cubic-bezier(0.3, 0, 0.2, 1), margin 0.35s cubic-bezier(0.3, 0, 0.2, 1),
    padding 0.35s cubic-bezier(0.3, 0, 0.2, 1), border-width 0.35s cubic-bezier(0.3, 0, 0.2, 1),
    opacity 0.3s ease 0.15s, transform 0.3s ease 0.15s;
}
.close-btn-leave-active {
  transition:
    opacity 0.2s ease, transform 0.2s ease,
    width 0.4s cubic-bezier(0.4, 0, 0.2, 1) 0.15s, margin 0.4s cubic-bezier(0.4, 0, 0.2, 1) 0.15s,
    padding 0.4s cubic-bezier(0.4, 0, 0.2, 1) 0.15s, border-width 0.4s cubic-bezier(0.4, 0, 0.2, 1) 0.15s;
}
.control.close-btn-enter-from,
.control.close-btn-leave-to { width: 0; min-width: 0; padding-inline: 0; margin-left: 0; border-width: 0; opacity: 0; transform: scale(0.6); }

@media (prefers-reduced-motion: reduce) {
  .stage.revealing, .stage.leaving { animation: none; }
}
</style>
