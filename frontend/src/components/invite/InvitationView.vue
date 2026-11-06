<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { effectiveContent, type InviteConfig, type InviteImages } from '@/invite/config'
import { FONT_PAIRINGS, loadFonts } from '@/invite/fonts'
import { inviteLabels } from '@/invite/labels'
import InviteCard from './InviteCard.vue'
import InviteCover from './InviteCover.vue'

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
  }>(),
  { event: null, startOpen: false },
)
const emit = defineEmits<{ opened: [] }>()

type Phase = 'cover' | 'opening' | 'open'
const phase = ref<Phase>(props.startOpen || !props.config.animation.enabled ? 'open' : 'cover')
// The invitation rises into view only when it is revealed by the opening, not when shown directly.
const revealing = ref(false)

const pairing = computed(() => FONT_PAIRINGS[props.config.design.font] ?? FONT_PAIRINGS.classic)
const labels = computed(() => inviteLabels(props.config.content.language))
const content = computed(() => effectiveContent(props.config, props.event))

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

function open() {
  if (phase.value !== 'cover') return
  phase.value = 'opening'
  revealing.value = true
}
function done() {
  phase.value = 'open'
  emit('opened')
}
/** Back to the cover, to watch the opening again. */
function replay() {
  revealing.value = false
  phase.value = props.config.animation.enabled ? 'cover' : 'open'
}
defineExpose({ replay, phase })
</script>

<template>
  <div
    class="invitation"
    :class="[`card-${config.design.card_style}`, { 'fonts-ready': fontsReady }]"
    :style="{ '--paper': config.design.background, '--ink': config.design.text_color, '--gold': config.design.accent }"
    :lang="config.content.language"
  >
    <div class="scroll" :inert="phase === 'cover' || undefined">
      <div class="stage" :class="{ revealing, hidden: phase === 'cover' }">
        <InviteCard
          :config="config"
          :content="content"
          :images="images"
          :labels="labels"
          :names-font="pairing.names"
          :text-font="pairing.text"
        />
      </div>
    </div>
    <InviteCover
      v-if="phase !== 'open'"
      :config="config"
      :images="images"
      :labels="labels"
      :names-font="pairing.names"
      :fonts-ready="fontsReady"
      :opening="phase === 'opening'"
      @open="open"
      @done="done"
    />
  </div>
</template>

<style scoped>
.invitation {
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
.stage.hidden { visibility: hidden; }
/* Revealed by the opening: the card rises out of the light as the cover parts. */
.stage.revealing { animation: card-rise 1.5s cubic-bezier(0.2, 0.7, 0.2, 1) 0.6s both; }
@keyframes card-rise {
  from { opacity: 0; transform: translateY(24px) scale(0.95); filter: blur(4px) brightness(1.25); }
}
@media (prefers-reduced-motion: reduce) {
  .stage.revealing { animation: none; }
}
</style>
