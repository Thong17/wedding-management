<script setup lang="ts">
import { computed, onBeforeUnmount, watch, type Directive } from 'vue'
import type { InviteConfig, InviteImages, InviteView, OrnateArea } from '@/invite/config'
import { formatInviteDate, formatInviteTime, type InviteLabels } from '@/invite/labels'
import InviteDivider from './InviteDivider.vue'
import InviteMap from './InviteMap.vue'
import InviteRoad from './InviteRoad.vue'

/**
 * The invitation itself: greeting, the couple, the event's date (and venue without a programme), message,
 * the programme (each item with its own place and map) and photos. Lays out by the width of its
 * container (see InvitationView), so previews in a phone or a desktop frame show exactly what guests get.
 * Each part rises into view as it is scrolled to, pictures one after another.
 */
const props = withDefaults(
  defineProps<{
    config: InviteConfig
    /** The words in the language shown, with the event's date and venue already filled in. */
    content: InviteView
    images: InviteImages
    labels: InviteLabels
    namesFont: string
    textFont: string
    /** Reveal the parts as they come into view; off while the cover still hides the card. */
    active?: boolean
    /** The opening has finished: heavier work (the programme road's scroll animation) waits for this. */
    settled?: boolean
  }>(),
  { active: true, settled: true },
)

const design = computed(() => props.config.design)
/** Whether an area uses the ornate gold frame (design.ornate_frames). */
const ornate = (area: OrnateArea) => design.value.ornate_frames.includes(area)
const lang = computed(() => props.content.language)
const img = (id: number | null) => (id != null ? props.images[String(id)] ?? null : null)
const hero = computed(() => img(props.content.hero_photo))
const gallery = computed(() => props.content.gallery.map((id) => img(id)).filter((u): u is string => !!u))
// The thank-you and apology notes: the couple's own words, or the language's default wording.
const thanks = computed(() => props.content.thanks || props.labels.defaultThanks)
const apology = computed(() => props.content.apology || props.labels.defaultApology)
const bankQrs = computed(() =>
  props.content.bank_qrs.flatMap((qr) => {
    const url = img(qr.image)
    return url ? [{ url, label: qr.label }] : []
  }),
)
// The event's own date; its venue only when there is no programme (which lists its own places).
const date = computed(() => formatInviteDate(props.content.date, lang.value))
const venue = computed(() => (props.content.timeline.length ? '' : props.content.venue))
// The programme's parts, with dates and times written out in the language shown.
const timeline = computed(() =>
  props.content.timeline.map((part) => ({
    ...part,
    day: formatInviteDate(part.date, lang.value),
    items: part.items.map((m) => ({ ...m, time: formatInviteTime(m.time, lang.value) })),
  })),
)


// Tapping a bank QR code or a gallery photo: InvitationView shows it (InviteQrDialog, InviteLightbox) over
// the whole invitation, not inside the card, so it covers everything, the corner buttons included.
const emit = defineEmits<{
  openQr: [qr: { url: string; label: string }]
  openPhoto: [photos: string[], index: number]
}>()

// Reveal on scroll: `v-reveal="n"` fades a part up into view when it is first seen, `n` steps of 110 ms
// after the others that come into view with it, so pictures appear one after another. Without
// IntersectionObserver (old browsers, tests) everything simply shows.
const pending = new Set<HTMLElement>()
let observer: IntersectionObserver | null = null
const show = (el: Element) => el.classList.add('shown')
function startRevealing() {
  if (observer || !props.active) return
  if (typeof IntersectionObserver === 'undefined') {
    pending.forEach(show)
    return
  }
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        show(entry.target)
        observer?.unobserve(entry.target)
        pending.delete(entry.target as HTMLElement)
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
  )
  pending.forEach((el) => observer!.observe(el))
}
const vReveal: Directive<HTMLElement, number | undefined> = {
  mounted(el, { value }) {
    el.classList.add('reveal')
    el.style.setProperty('--reveal-delay', `${Math.min(value ?? 0, 12) * 110}ms`)
    pending.add(el)
    if (observer) observer.observe(el)
    else if (props.active && typeof IntersectionObserver === 'undefined') show(el)
  },
  unmounted(el) {
    observer?.unobserve(el)
    pending.delete(el)
  },
}
watch(() => props.active, startRevealing, { immediate: true })
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <article
    class="invite-card"
    :class="[`style-${design.card_style}`, { 'with-border': design.gold_border, 'with-hero': !!hero }]"
    :style="{ '--ink': design.text_color, '--gold': design.accent, '--paper': design.background, fontFamily: textFont }"
  >
    <!-- Ornate card: its corners and a top ornament in the invitation's frame style (ornate.css), on the
         double gold border. -->
    <span v-if="design.gold_corners && design.card_style === 'ornate'" class="card-ornaments" aria-hidden="true">
      <span class="ornate-corners" />
      <span v-if="design.gold_border" class="ornate-top" />
    </span>
    <template v-else-if="design.gold_corners">
      <svg v-for="c in ['tl', 'tr', 'bl', 'br']" :key="c" class="corner" :class="c" viewBox="0 0 80 80" aria-hidden="true">
        <path d="M4 76V20Q4 4 20 4h56" fill="none" stroke="currentColor" stroke-width="1.6" />
        <path d="M12 76V28Q12 12 28 12h48" fill="none" stroke="currentColor" stroke-width="0.8" />
        <path d="M20 30q4-10 14-10M30 20q-2 6 4 8" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
        <circle cx="20" cy="20" r="2.6" fill="currentColor" />
      </svg>
    </template>
    <span v-if="design.sparkles" class="sparkles" aria-hidden="true"><i v-for="n in 7" :key="n" /></span>

    <div class="layout">
      <figure v-if="hero" v-reveal="0" class="hero reveal-image" :class="{ 'invite-frame invite-ornate ornate-arch': ornate('hero') }">
        <img :src="hero" alt="" loading="eager" :style="{ objectPosition: `${design.hero_x}% ${design.hero_y}%` }" />
      </figure>

      <div class="body">
        <p v-reveal="0" class="small-caps">{{ labels.greetingTitle }}</p>
        <p v-reveal="1" class="greeting">{{ content.greeting || labels.defaultGreeting }}</p>
        <h1 v-reveal="2" class="title">{{ content.title || labels.defaultTitle }}</h1>
        <InviteDivider v-if="design.gold_dividers" :variant="design.ornate_style" v-reveal="2" />

        <div v-reveal="3" class="couple" :class="{ 'invite-frame invite-ornate': ornate('names') }" :style="{ fontFamily: namesFont }">
          <span class="name">{{ content.partner1 }}</span>
          <span v-if="content.partner1 && content.partner2" class="amp">{{ labels.and }}</span>
          <span class="name">{{ content.partner2 }}</span>
        </div>

        <InviteDivider v-if="design.gold_dividers" :variant="design.ornate_style" v-reveal="4" />

        <dl v-if="date || venue" class="details">
          <div v-if="date" v-reveal="4">
            <dt>{{ labels.date }}</dt>
            <dd>{{ date }}</dd>
          </div>
          <div v-if="venue" v-reveal="5">
            <dt>{{ labels.venue }}</dt>
            <dd><strong>{{ venue }}</strong></dd>
          </div>
        </dl>

        <p v-reveal="1" class="message">{{ content.message || labels.defaultMessage }}</p>
      </div>
    </div>

    <!-- The programme: parts of the day (each at its own place, with its map), then their moments. -->
    <section v-if="timeline.length" class="programme">
      <InviteDivider v-if="design.gold_dividers" :variant="design.ornate_style" v-reveal="0" />
      <h2 v-reveal="0" class="small-caps">{{ labels.programme }}</h2>
      <div v-for="(part, p) in timeline" :key="p" class="part">
        <header v-reveal="0" class="part-head">
          <h3 v-if="part.title" class="part-title" :style="{ fontFamily: namesFont }">{{ part.title }}</h3>
          <p v-if="part.day" class="day">{{ part.day }}</p>
          <p v-if="part.place || part.address" class="part-place">
            <strong v-if="part.place">{{ part.place }}</strong>
            <span v-if="part.address" class="address">{{ part.address }}</span>
          </p>
        </header>
        <InviteRoad v-if="part.items.length" :items="part.items" :variant="design.route_style" :ornate="ornate('programme')" :active="active && settled" />
        <InviteMap
          :ornate="ornate('maps')"
          v-if="part.maps_url || part.place || part.address"
          v-reveal="0"
          :maps-url="part.maps_url"
          :place="part.place"
          :address="part.address"
          :label="labels.openMaps"
        />
      </div>
    </section>

    <section v-if="gallery.length" class="gallery">
      <InviteDivider v-if="design.gold_dividers" :variant="design.ornate_style" v-reveal="0" />
      <h2 v-reveal="0" class="small-caps">{{ labels.gallery }}</h2>
      <div class="grid">
        <button
          v-for="(src, i) in gallery"
          :key="src"
          v-reveal="i"
          type="button"
          class="thumb reveal-image"
          :class="{ 'invite-frame invite-ornate': ornate('gallery') }"
          @click="emit('openPhoto', gallery, i)"
        >
          <!-- The photo in a window (clipped), inside the frame when it has one (which must not clip). -->
          <span class="thumb-view"><img :src="src" alt="" loading="lazy" /></span>
        </button>
      </div>
    </section>

    <!-- The very bottom: the thank-you note, the apology note (for not inviting in person), then the bank QR codes for gifts.
         Tapping a code opens it full size, to save and scan in a banking app. -->
    <section class="closing">
      <InviteDivider v-if="design.gold_dividers" :variant="design.ornate_style" v-reveal="0" />
      <h2 v-reveal="0" class="small-caps">{{ labels.thanksTitle }}</h2>
      <p v-reveal="1" class="apology">{{ thanks }}</p>
      <h2 v-reveal="0" class="small-caps note-title">{{ labels.apologyTitle }}</h2>
      <p v-reveal="1" class="apology">{{ apology }}</p>
      <div v-if="bankQrs.length" class="gift">
        <h2 v-reveal="1" class="small-caps">{{ labels.gift }}</h2>
        <div class="bank-qrs">
          <button
            v-for="(qr, i) in bankQrs"
            :key="qr.url"
            v-reveal="i + 2"
            type="button"
            class="bank-qr invite-frame"
            :class="{ 'invite-ornate': ornate('gifts') }"
            :aria-label="qr.label || labels.gift"
            @click="emit('openQr', qr)"
          >
            <img :src="qr.url" alt="" loading="lazy" />
            <span v-if="qr.label" class="bank-label">{{ qr.label }}</span>
          </button>
        </div>
        <p v-reveal="3" class="gift-hint">{{ labels.giftHint }}</p>
      </div>
    </section>
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
  /* Slightly translucent, so the golden particles drifting behind the card glow softly through it. */
  background: color-mix(in srgb, var(--paper) 80%, transparent);
  box-shadow: 0 30px 80px rgb(0 0 0 / 0.18), 0 2px 6px rgb(0 0 0 / 0.08);
  border-radius: var(--r-sm);
}
/* Clear of the gold lines (14px in on framed, 26px on ornate), with room to spare, even on a phone. */
.style-framed.with-border { padding-inline: clamp(34px, 7cqi, 64px); }
.style-ornate.with-border { padding-inline: clamp(42px, 7cqi, 64px); }
.style-framed.with-border { outline: 1px solid color-mix(in srgb, var(--gold) 70%, transparent); outline-offset: -14px; }
.style-ornate.with-border {
  outline: 3px double var(--gold);
  outline-offset: -16px;
}
/* Ornate: a second, finer gold line inside the double border. */
.style-ornate.with-border::before {
  content: '';
  position: absolute;
  inset: 26px;
  border: 1px solid color-mix(in srgb, var(--gold) 45%, transparent);
  pointer-events: none;
}
.style-minimal { background: transparent; }
/* The ornate card's ornaments (frame style): on the double border, 16px in from the edge. */
.card-ornaments {
  position: absolute;
  inset: 16px;
  pointer-events: none;
  /* The corners sit just inside the border. */
  --ornate-inset: 4px;
  --ornate-corner: clamp(30px, 7.5cqi, 56px);
  --ornate-top-scale: 2.4;
}

.corner { position: absolute; width: clamp(34px, 8.5cqi, 64px); height: auto; color: var(--gold); pointer-events: none; }
.style-ornate .corner { width: clamp(44px, 10cqi, 84px); }
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
  corner-shape: round; /* the arch stays a true arch */
  border: 1px solid color-mix(in srgb, var(--gold) 80%, transparent);
  padding: 6px;
  background: var(--paper);
  box-shadow: 0 16px 40px rgb(0 0 0 / 0.18);
}
/* Ornate: the arch is the frame (gold border, inner line, flourishes in the bottom corners, the diamond
   at its peak), and the photo sits inside it with a thin gold line of its own. */
.hero.invite-ornate {
  --ornate-corner: 22px;
  --ornate-inset: 5px;
  --ornate-shadow: 0 16px 40px rgb(0 0 0 / 0.18);
  padding: 10px;
  border-radius: 999px 999px 12px 12px;
  corner-shape: round;
  background-color: var(--paper);
}
.hero.invite-ornate img {
  padding: 0;
  border-radius: 999px 999px 6px 6px;
  border-color: color-mix(in srgb, var(--gold) 55%, transparent);
  box-shadow: none;
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
/* Khmer stacks vowels and subscripts above and below the line (very tall in Moul): more room, so the
   names and "និង" don't overlap. */
.couple:lang(km) { line-height: 1.75; gap: 0.2em; }
/* Ornate: the names on a framed plaque. */
.couple.invite-ornate {
  --ornate-corner: 20px;
  --ornate-inset: 5px;
  --ornate-shadow: 0 10px 28px color-mix(in srgb, var(--ink) 10%, transparent);
  width: fit-content;
  max-width: 100%;
  padding: clamp(16px, 4cqi, 26px) clamp(26px, 8cqi, 52px);
  border-radius: var(--r-md);
  background-color: color-mix(in srgb, var(--paper) 94%, transparent);
}
.name { font-size: calc(clamp(2.2rem, 9cqi, 4rem) * var(--names-scale, 1)); font-weight: 500; }
.amp { font-size: calc(clamp(1.4rem, 5cqi, 2.2rem) * var(--names-scale, 1)); color: var(--gold); font-style: italic; }

.details { display: flex; flex-direction: column; align-items: center; gap: 14px; margin: 0; width: 100%; }
.details div { display: flex; flex-direction: column; gap: 2px; }
.details dt { font-size: 0.72em; letter-spacing: 0.24em; text-transform: uppercase; color: var(--gold); font-weight: 600; }
.details dd { margin: 0; display: flex; flex-direction: column; }
.address { opacity: 0.8; font-size: 0.92em; }
.message { margin: 0; white-space: pre-line; max-width: 32em; font-style: italic; }

/* The very bottom: the apology note, then the gift QR codes. */
.closing {
  margin: clamp(28px, 6cqi, 56px) auto 0;
  max-width: 620px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}
.apology { margin: 0; white-space: pre-line; max-width: 34em; line-height: 1.75; }
.closing .note-title { margin-top: clamp(6px, 1.5cqi, 12px); }
.closing .gift { margin-top: clamp(8px, 2cqi, 16px); }

/* Bank QR codes: white cards (so they scan whatever the background), side by side. */
.gift { display: flex; flex-direction: column; align-items: center; gap: 12px; width: 100%; }
.bank-qrs { display: flex; justify-content: center; gap: clamp(10px, 3cqi, 18px); width: 100%; }
.bank-qr {
  font: inherit;
  cursor: pointer;
  min-height: 0;
  flex: 1 1 0;
  min-width: 0;
  max-width: 200px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  /* White (so the code scans whatever the background), in the shared frame. Padding leaves room for the
     ornate frame's corner flourishes around the code. */
  --ornate-corner: 14px;
  --ornate-shadow: 0 10px 26px rgb(0 0 0 / 0.1);
  padding: clamp(14px, 4cqi, 18px);
  border-radius: var(--r-md);
  background-color: #fff;
  color: #2b1418;
  text-decoration: none;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.bank-qr:hover { transform: translateY(-2px); --ornate-shadow: 0 14px 32px rgb(0 0 0 / 0.14); }
.bank-qr img { width: 100%; aspect-ratio: 1; object-fit: contain; display: block; }
.bank-label { font-size: 0.9em; font-weight: 600; text-align: center; line-height: 1.3; }
.gift-hint { margin: 0; font-size: 0.85em; opacity: 0.75; max-width: 28em; }


/* Programme: parts of the day: the title, date and place, the route of its moments, then its map. */
.programme { margin-top: clamp(28px, 6cqi, 56px); display: flex; flex-direction: column; align-items: center; gap: 18px; }
/* No box around a part: the route needs the full width. Parts are set apart by space. */
.part {
  width: min(100%, 620px);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 10px 0 clamp(24px, 6cqi, 40px);
}
.part-head { display: flex; flex-direction: column; align-items: center; gap: 4px; text-align: center; }
.part-title { margin: 0; font-size: clamp(1.5rem, 5.5cqi, 2rem); font-weight: 500; line-height: 1.3; }
.day {
  margin: 0;
  font-size: 0.8em;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--gold);
  font-weight: 600;
}
.day:lang(km) { letter-spacing: 0; text-transform: none; }
.part-place { margin: 4px 0 0; display: flex; flex-direction: column; }

/* Reveal on scroll (see vReveal): parts rise into view; pictures uncover from the bottom. */
.reveal {
  opacity: 0;
  transform: translateY(18px);
  transition: opacity 0.8s ease var(--reveal-delay, 0ms), transform 0.9s cubic-bezier(0.2, 0.7, 0.2, 1) var(--reveal-delay, 0ms);
}
.reveal.shown { opacity: 1; transform: none; }
.reveal-image.reveal { transform: translateY(24px) scale(0.97); clip-path: inset(18% 0 0 0 round 8px); transition-property: opacity, transform, clip-path; transition-duration: 0.9s, 1.1s, 1.1s; }
.reveal-image.reveal.shown { transform: none; clip-path: inset(0 0 0 0 round 0); }
.hero.reveal-image.reveal.shown { clip-path: none; }
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
.thumb { padding: 0; border: 0; background: none; border-radius: var(--r-sm); overflow: hidden; cursor: zoom-in; aspect-ratio: 1; }
.thumb-view { display: block; width: 100%; height: 100%; overflow: hidden; border-radius: inherit; }
/* Ornate: the photo is mounted in the frame, which must not clip (its diamond sits across the top). */
.thumb.invite-ornate { --ornate-corner: 14px; --ornate-inset: 4px; padding: 7px; overflow: visible; background-color: var(--paper); }
.thumb.invite-ornate .thumb-view { border-radius: calc(var(--r-sm) - 4px); }
.thumb.invite-ornate.reveal-image.reveal.shown { clip-path: none; }
.thumb img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.6s ease; display: block; }
.thumb:hover img { transform: scale(1.05); }


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
.title:lang(km), .details dt:lang(km), .small-caps:lang(km) { letter-spacing: 0; text-transform: none; }
/* Khmer fonts have no italic; a slanted fake reads poorly. */
.message:lang(km), .amp:lang(km) { font-style: normal; }
@media (prefers-reduced-motion: reduce) {
  .sparkles i { animation: none; opacity: 0.5; }
  .reveal, .reveal-image.reveal { opacity: 1; transform: none; clip-path: none; transition: none; }
}
</style>

