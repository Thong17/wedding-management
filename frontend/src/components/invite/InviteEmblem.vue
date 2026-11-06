<script setup lang="ts">
import { computed, useId } from 'vue'

/**
 * The cover's gold seal: a scalloped wax-seal disc with a gold rim, holding the couple's initials
 * (monogram), a floral mark (seal) or an uploaded logo (image). Sized by the parent (width/height).
 */
const props = defineProps<{
  kind: 'monogram' | 'seal' | 'image'
  initials: [string, string]
  imageUrl?: string | null
  accent: string
  /** The seal's own color (the cover color, deepened). */
  wax: string
  namesFont: string
}>()

const id = useId()
// 24 scallops around the disc.
const scallops = computed(() => {
  const points: string[] = []
  const n = 24
  for (let i = 0; i <= n * 2; i++) {
    const angle = (Math.PI * i) / n
    const r = i % 2 === 0 ? 96 : 89
    points.push(`${100 + r * Math.cos(angle)},${100 + r * Math.sin(angle)}`)
  }
  return points.join(' ')
})
const showImage = computed(() => props.kind === 'image' && !!props.imageUrl)
const pair = computed(() => props.initials.filter(Boolean))
</script>

<template>
  <svg class="emblem" viewBox="0 0 200 200" role="img" aria-hidden="true">
    <defs>
      <linearGradient :id="`${id}-gold`" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#f6e3a1" />
        <stop offset="0.45" :stop-color="accent" />
        <stop offset="0.7" stop-color="#8a6420" />
        <stop offset="1" stop-color="#f1d58a" />
      </linearGradient>
      <radialGradient :id="`${id}-wax`" cx="0.38" cy="0.32" r="0.8">
        <stop offset="0" :stop-color="wax" stop-opacity="0.85" />
        <stop offset="1" :stop-color="wax" />
      </radialGradient>
      <clipPath :id="`${id}-inner`"><circle cx="100" cy="100" r="66" /></clipPath>
      <filter :id="`${id}-shadow`" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="4" stdDeviation="5" flood-color="#000" flood-opacity="0.35" />
      </filter>
    </defs>
    <g :filter="`url(#${id}-shadow)`">
      <polygon :points="scallops" :fill="`url(#${id}-gold)`" />
      <circle cx="100" cy="100" r="82" :fill="`url(#${id}-wax)`" />
      <circle cx="100" cy="100" r="76" fill="none" :stroke="`url(#${id}-gold)`" stroke-width="2.5" />
      <circle cx="100" cy="100" r="70" fill="none" :stroke="`url(#${id}-gold)`" stroke-width="0.8" stroke-dasharray="1.5 3.5" />
    </g>
    <image
      v-if="showImage"
      :href="imageUrl!"
      x="34" y="34" width="132" height="132"
      preserveAspectRatio="xMidYMid slice"
      :clip-path="`url(#${id}-inner)`"
    />
    <g v-else-if="kind === 'monogram' && pair.length" :fill="`url(#${id}-gold)`" :style="{ fontFamily: namesFont }">
      <text v-if="pair.length === 2" x="100" y="103" text-anchor="middle" dominant-baseline="middle" font-size="58">
        {{ pair[0] }}<tspan font-size="30" dx="4" dy="-4">&amp;</tspan><tspan dx="4" dy="4">{{ pair[1] }}</tspan>
      </text>
      <text v-else x="100" y="103" text-anchor="middle" dominant-baseline="middle" font-size="72">{{ pair[0] }}</text>
    </g>
    <!-- Seal: a gold flourish with a small heart. -->
    <g v-else fill="none" :stroke="`url(#${id}-gold)`" stroke-width="2.4" stroke-linecap="round">
      <path d="M100 128c-18-12-30-22-30-36a14 14 0 0 1 30-6 14 14 0 0 1 30 6c0 14-12 24-30 36z" :fill="`url(#${id}-gold)`" stroke="none" />
      <path d="M58 100c-10 0-16-6-16-12M142 100c10 0 16-6 16-12" />
      <path d="M62 120c14 10 62 10 76 0" />
      <path d="M78 66c8-8 36-8 44 0" />
    </g>
  </svg>
</template>

<style scoped>
.emblem { display: block; width: 100%; height: 100%; overflow: visible; }
</style>
