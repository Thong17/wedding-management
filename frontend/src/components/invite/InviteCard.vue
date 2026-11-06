<script setup lang="ts">
import QRCode from 'qrcode'
import { computed, ref, watch } from 'vue'
import type { InviteConfig, InviteImages } from '@/invite/config'
import { formatInviteDate, formatInviteTime, type InviteLabels } from '@/invite/labels'
import InviteDivider from './InviteDivider.vue'

/**
 * The invitation itself: greeting, the couple, date and time, venue, message, directions (link and QR)
 * and photos. Lays out by the width of its container (see InvitationView), so previews in a phone or a
 * desktop frame show exactly what guests get.
 */
const props = defineProps<{
  config: InviteConfig
  /** Content with the event's date and venue already filled in. */
  content: InviteConfig['content']
  images: InviteImages
  labels: InviteLabels
  namesFont: string
  textFont: string
}>()

const design = computed(() => props.config.design)
const lang = computed(() => props.content.language)
const img = (id: number | null) => (id != null ? props.images[String(id)] ?? null : null)
const hero = computed(() => img(props.content.hero_photo))
const gallery = computed(() => props.content.gallery.map((id) => img(id)).filter((u): u is string => !!u))
const date = computed(() => formatInviteDate(props.content.date, lang.value))
const time = computed(() => formatInviteTime(props.content.time, lang.value))

const qr = ref<string | null>(null)
watch(
  () => [props.content.maps_url, design.value.text_color] as const,
  async ([url, ink]) => {
    qr.value = url ? await QRCode.toDataURL(url, { margin: 1, width: 240, color: { dark: ink, light: '#00000000' } }).catch(() => null) : null
  },
  { immediate: true },
)

const viewing = ref<number | null>(null)
function step(by: number) {
  if (viewing.value == null) return
  viewing.value = (viewing.value + by + gallery.value.length) % gallery.value.length
}
</script>

<template>
  <article
    class="invite-card"
    :class="[`style-${design.card_style}`, { 'with-border': design.gold_border, 'with-hero': !!hero }]"
    :style="{ '--ink': design.text_color, '--gold': design.accent, '--paper': design.background, fontFamily: textFont }"
  >
    <template v-if="design.gold_corners">
      <svg v-for="c in ['tl', 'tr', 'bl', 'br']" :key="c" class="corner" :class="c" viewBox="0 0 80 80" aria-hidden="true">
        <path d="M4 76V20Q4 4 20 4h56" fill="none" stroke="currentColor" stroke-width="1.6" />
        <path d="M12 76V28Q12 12 28 12h48" fill="none" stroke="currentColor" stroke-width="0.8" />
        <path d="M20 30q4-10 14-10M30 20q-2 6 4 8" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
        <circle cx="20" cy="20" r="2.6" fill="currentColor" />
      </svg>
    </template>
    <span v-if="design.sparkles" class="sparkles" aria-hidden="true"><i v-for="n in 7" :key="n" /></span>

    <div class="layout">
      <figure v-if="hero" class="hero">
        <img :src="hero" alt="" loading="eager" />
      </figure>

      <div class="body">
        <p class="greeting">{{ content.greeting || labels.defaultGreeting }}</p>
        <h1 class="title">{{ content.title || labels.defaultTitle }}</h1>
        <InviteDivider v-if="design.gold_dividers" />

        <div class="couple" :style="{ fontFamily: namesFont }">
          <span class="name">{{ content.partner1 }}</span>
          <span v-if="content.partner1 && content.partner2" class="amp">{{ labels.and }}</span>
          <span class="name">{{ content.partner2 }}</span>
        </div>

        <InviteDivider v-if="design.gold_dividers" />

        <dl class="details">
          <div v-if="date">
            <dt>{{ labels.date }}</dt>
            <dd>{{ date }}</dd>
          </div>
          <div v-if="time">
            <dt>{{ labels.time }}</dt>
            <dd>{{ time }}</dd>
          </div>
          <div v-if="content.venue || content.address">
            <dt>{{ labels.venue }}</dt>
            <dd>
              <strong v-if="content.venue">{{ content.venue }}</strong>
              <span v-if="content.address" class="address">{{ content.address }}</span>
            </dd>
          </div>
        </dl>

        <p v-if="content.message" class="message">{{ content.message }}</p>

        <section v-if="content.maps_url" class="directions">
          <img v-if="qr" class="qr" :src="qr" :alt="labels.scanForDirections" />
          <div class="directions-text">
            <span class="small-caps">{{ labels.scanForDirections }}</span>
            <a class="maps" :href="content.maps_url" target="_blank" rel="noopener">{{ labels.openMaps }}</a>
          </div>
        </section>
      </div>
    </div>

    <section v-if="gallery.length" class="gallery">
      <InviteDivider v-if="design.gold_dividers" />
      <h2 class="small-caps">{{ labels.gallery }}</h2>
      <div class="grid">
        <button v-for="(src, i) in gallery" :key="src" type="button" class="thumb" @click="viewing = i">
          <img :src="src" alt="" loading="lazy" />
        </button>
      </div>
    </section>

    <div v-if="viewing != null" class="lightbox" role="dialog" aria-modal="true" @click.self="viewing = null" @keydown.esc="viewing = null">
      <img :src="gallery[viewing]" alt="" />
      <button type="button" class="lb-close" :aria-label="labels.close" @click="viewing = null">×</button>
      <template v-if="gallery.length > 1">
        <button type="button" class="lb-prev" aria-label="‹" @click="step(-1)">‹</button>
        <button type="button" class="lb-next" aria-label="›" @click="step(1)">›</button>
      </template>
    </div>
  </article>
</template>

<style scoped>
.invite-card {
  position: relative;
  width: min(100%, 980px);
  margin: 0 auto;
  padding: clamp(40px, 9cqi, 72px) clamp(22px, 7cqi, 64px);
  color: var(--ink);
  text-align: center;
  line-height: 1.6;
  font-size: clamp(1rem, 2.6cqi, 1.15rem);
}
.style-framed,
.style-ornate {
  background: var(--paper);
  box-shadow: 0 30px 80px rgb(0 0 0 / 0.18), 0 2px 6px rgb(0 0 0 / 0.08);
  border-radius: 4px;
}
.style-framed.with-border { outline: 1px solid color-mix(in srgb, var(--gold) 70%, transparent); outline-offset: -14px; }
.style-ornate.with-border {
  outline: 3px double var(--gold);
  outline-offset: -16px;
  box-shadow: inset 0 0 0 26px var(--paper), inset 0 0 0 27px color-mix(in srgb, var(--gold) 45%, transparent), 0 30px 80px rgb(0 0 0 / 0.18);
}
.style-minimal { background: transparent; }

.corner { position: absolute; width: clamp(48px, 12cqi, 92px); height: auto; color: var(--gold); pointer-events: none; }
.style-ornate .corner { width: clamp(64px, 15cqi, 120px); }
.corner.tl { top: 6px; left: 6px; }
.corner.tr { top: 6px; right: 6px; transform: scaleX(-1); }
.corner.bl { bottom: 6px; left: 6px; transform: scaleY(-1); }
.corner.br { bottom: 6px; right: 6px; transform: scale(-1, -1); }

.layout { display: flex; flex-direction: column; align-items: center; gap: clamp(24px, 5cqi, 48px); }
.hero { margin: 0; width: min(100%, 360px); }
.hero img {
  display: block;
  width: 100%;
  aspect-ratio: 4 / 5;
  object-fit: cover;
  border-radius: 999px 999px 8px 8px;
  border: 1px solid color-mix(in srgb, var(--gold) 80%, transparent);
  padding: 6px;
  background: var(--paper);
  box-shadow: 0 16px 40px rgb(0 0 0 / 0.18);
}
.body { display: flex; flex-direction: column; align-items: center; gap: clamp(14px, 3cqi, 22px); max-width: 620px; }

.greeting { margin: 0; font-size: 0.95em; max-width: 34em; opacity: 0.85; }
.title {
  margin: 0;
  font-family: inherit;
  font-weight: 600;
  font-size: clamp(0.85rem, 2.4cqi, 1rem);
  letter-spacing: 0.3em;
  text-transform: uppercase;
  color: var(--gold);
}
.couple { display: flex; flex-direction: column; align-items: center; gap: 0.1em; line-height: 1.2; }
.name { font-size: clamp(2.2rem, 9cqi, 4rem); font-weight: 500; }
.amp { font-size: clamp(1.4rem, 5cqi, 2.2rem); color: var(--gold); font-style: italic; }

.details { display: flex; flex-direction: column; align-items: center; gap: 14px; margin: 0; width: 100%; }
.details div { display: flex; flex-direction: column; gap: 2px; }
.details dt { font-size: 0.72em; letter-spacing: 0.24em; text-transform: uppercase; color: var(--gold); font-weight: 600; }
.details dd { margin: 0; display: flex; flex-direction: column; }
.address { opacity: 0.8; font-size: 0.92em; }
.message { margin: 0; white-space: pre-line; max-width: 32em; font-style: italic; }

.directions {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 18px;
  border: 1px solid color-mix(in srgb, var(--gold) 55%, transparent);
  border-radius: 12px;
  text-align: left;
}
.qr { width: 96px; height: 96px; }
.directions-text { display: flex; flex-direction: column; gap: 6px; }
.small-caps { font-size: 0.75em; letter-spacing: 0.22em; text-transform: uppercase; color: var(--gold); font-weight: 600; margin: 0; }
.maps {
  color: var(--ink);
  font-weight: 600;
  text-decoration: none;
  border-bottom: 1px solid var(--gold);
  width: fit-content;
}

.gallery { margin-top: clamp(28px, 6cqi, 56px); display: flex; flex-direction: column; align-items: center; gap: 16px; }
.grid { display: grid; width: 100%; gap: 10px; grid-template-columns: repeat(2, 1fr); }
.thumb { padding: 0; border: 0; background: none; border-radius: 6px; overflow: hidden; cursor: zoom-in; aspect-ratio: 1; }
.thumb img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.6s ease; display: block; }
.thumb:hover img { transform: scale(1.05); }

.lightbox {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: rgb(10 4 6 / 0.92);
  display: flex;
  align-items: center;
  justify-content: center;
  animation: lb-in 0.25s ease-out;
}
.lightbox img { max-width: 92vw; max-height: 86vh; object-fit: contain; border-radius: 4px; }
.lightbox button {
  position: absolute;
  border: 0;
  background: rgb(255 255 255 / 0.12);
  color: #fff;
  width: 44px;
  height: 44px;
  min-height: 44px;
  border-radius: 50%;
  font-size: 1.6rem;
  line-height: 1;
  padding: 0;
  justify-content: center;
}
.lb-close { top: 16px; right: 16px; }
.lb-prev { left: 12px; top: 50%; }
.lb-next { right: 12px; top: 50%; }
@keyframes lb-in { from { opacity: 0; } }

/* Sparkles: tiny gold glints that come and go. */
.sparkles { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
.sparkles i {
  position: absolute;
  width: 6px;
  height: 6px;
  background: var(--gold);
  clip-path: polygon(50% 0, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0 50%, 38% 38%);
  opacity: 0;
  animation: glint 4.5s ease-in-out infinite;
}
.sparkles i:nth-child(1) { top: 12%; left: 14%; animation-delay: 0s; }
.sparkles i:nth-child(2) { top: 22%; right: 12%; animation-delay: 0.8s; }
.sparkles i:nth-child(3) { top: 48%; left: 7%; animation-delay: 1.6s; }
.sparkles i:nth-child(4) { top: 60%; right: 9%; animation-delay: 2.3s; }
.sparkles i:nth-child(5) { bottom: 14%; left: 20%; animation-delay: 3s; }
.sparkles i:nth-child(6) { bottom: 9%; right: 22%; animation-delay: 3.6s; }
.sparkles i:nth-child(7) { top: 35%; left: 50%; animation-delay: 4.1s; }
@keyframes glint {
  0%, 100% { opacity: 0; transform: scale(0.4) rotate(0deg); }
  50% { opacity: 0.9; transform: scale(1.3) rotate(45deg); }
}

/* Wide containers (desktop, tablet landscape): photo beside the text, more photos per row. */
@container invite (min-width: 900px) {
  .with-hero .layout { flex-direction: row; align-items: center; text-align: center; }
  .with-hero .hero { flex: 0 0 38%; }
  .with-hero .body { flex: 1; }
}
/* Tablets and up: date and time side by side, three or four photos per row. */
@container invite (min-width: 600px) {
  .details { flex-direction: row; flex-wrap: wrap; justify-content: center; align-items: flex-start; column-gap: 48px; }
  .details div:last-child:nth-child(3) { flex-basis: 100%; }
  .grid { grid-template-columns: repeat(3, 1fr); }
}
@container invite (min-width: 1100px) {
  .grid { grid-template-columns: repeat(4, 1fr); }
}
/* Khmer script: wide letter-spacing breaks its stacked consonants apart. */
.title:lang(km), .details dt:lang(km), .small-caps:lang(km) { letter-spacing: 0.02em; text-transform: none; }
/* Khmer fonts have no italic; a slanted fake reads poorly. */
.message:lang(km), .amp:lang(km) { font-style: normal; }
@media (prefers-reduced-motion: reduce) {
  .sparkles i { animation: none; opacity: 0.5; }
}
</style>

