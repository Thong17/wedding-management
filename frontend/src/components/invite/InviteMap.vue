<script setup lang="ts">
import { computed } from 'vue'
import { embedUrl, mapQuery, openUrl } from '@/invite/maps'

/**
 * A programme place on a real map: wide and short, below the part's route. The map itself can't be
 * dragged (a map inside a scrolling page would catch the guest's swipes); the whole map is a link that
 * opens Google Maps, with a button saying so.
 */
const props = defineProps<{ mapsUrl: string; place: string; address: string; label: string }>()

const query = computed(() => mapQuery(props.mapsUrl, props.place, props.address))
const src = computed(() => (query.value ? embedUrl(query.value) : null))
const href = computed(() => (query.value ? openUrl(props.mapsUrl, query.value) : props.mapsUrl))
</script>

<template>
  <a v-if="src" class="map" :href="href" target="_blank" rel="noopener" :aria-label="`${label}: ${place || address}`">
    <iframe :src="src" :title="place || address || label" loading="lazy" referrerpolicy="no-referrer-when-downgrade" tabindex="-1" />
    <span class="map-open">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
      {{ label }}
    </span>
  </a>
</template>

<style scoped>
.map {
  position: relative;
  display: block;
  width: 100%;
  height: clamp(130px, 28cqi, 170px);
  border-radius: var(--r-md, 14px);
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--gold) 50%, transparent);
  box-shadow: 0 10px 26px rgb(0 0 0 / 0.1);
  background: color-mix(in srgb, var(--paper) 80%, var(--ink) 8%);
  isolation: isolate;
}
/* The map is shown, not used: taps go to the link around it. Slightly warmed to sit with the paper. */
.map iframe {
  width: 100%;
  /* Taller than the box and centred in it: the box crops away Google's own corner buttons, and the
     place stays in the middle. */
  height: calc(100% + 160px);
  margin-top: -80px;
  border: 0;
  pointer-events: none;
  filter: sepia(0.18) saturate(0.9);
}
.map-open {
  position: absolute;
  right: 10px;
  bottom: 10px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  border-radius: 999px;
  corner-shape: round;
  background: var(--ink);
  color: var(--paper);
  font-size: 0.82em;
  font-weight: 600;
  box-shadow: 0 4px 12px rgb(0 0 0 / 0.25);
}
.map-open svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
</style>
