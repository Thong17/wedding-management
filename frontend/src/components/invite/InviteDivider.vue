<!--
  A gold flourish between sections of the invitation, in the invitation's frame style (design.ornate_style,
  as for the ornate frames in src/invite/ornate.css). Takes its colour from --gold.
-->
<script setup lang="ts">
import type { OrnateStyle } from '@/invite/config'

withDefaults(defineProps<{ variant?: OrnateStyle }>(), { variant: 'royal' })
</script>

<template>
  <svg class="divider" :class="`divider-${variant}`" viewBox="0 0 240 24" aria-hidden="true">
    <!-- Royal: lines to a diamond, with a wave through it and a bead at each side. -->
    <g v-if="variant === 'royal'">
      <path d="M8 12h86M146 12h86" stroke="currentColor" stroke-width="0.9" fill="none" />
      <path d="M120 4l8 8-8 8-8-8z" fill="currentColor" />
      <path d="M100 12q10-9 20 0q10 9 20 0" stroke="currentColor" stroke-width="1.1" fill="none" />
      <circle cx="94" cy="12" r="1.8" fill="currentColor" />
      <circle cx="146" cy="12" r="1.8" fill="currentColor" />
    </g>
    <!-- Khmer traditional: a kbach bloom (as on the frames), lines curling into scrolls at their ends. -->
    <g v-else-if="variant === 'khmer'">
      <path d="M14 14h82M144 14h82" stroke="currentColor" stroke-width="0.9" fill="none" />
      <path d="M14 14c-5 0-6-6-1-6c3 0 3 4 0.5 3.5M226 14c5 0 6-6 1-6c-3 0-3 4-0.5 3.5" stroke="currentColor" stroke-width="1" fill="none" stroke-linecap="round" />
      <circle cx="90" cy="14" r="1.6" fill="currentColor" />
      <circle cx="150" cy="14" r="1.6" fill="currentColor" />
      <g transform="translate(100 0)" fill="currentColor"><path d="M20 0.4C22.4 4.6 24.4 8.8 23.2 13.6C22.6 15.8 17.4 15.8 16.8 13.6C15.6 8.8 17.6 4.6 20 0.4Z"/><path d="M18.8 14.2C19.64 11.02 17.87 8.41 15.03 7.71C14 7.65 13.56 8.63 14.44 9.49C15.64 10.87 16.95 13.14 18.8 14.2Z"/><path d="M21.2 14.2C20.36 11.02 22.13 8.41 24.97 7.71C26 7.65 26.44 8.63 25.56 9.49C24.36 10.87 23.05 13.14 21.2 14.2Z"/><path d="M18.6 16.2C16.87 11.28 12.31 9.65 8.08 11.53C6.72 12.45 7.03 14.14 8.91 14.39C11.65 14.99 15.32 16.65 18.6 16.2Z"/><path d="M21.4 16.2C23.13 11.28 27.69 9.65 31.92 11.53C33.28 12.45 32.97 14.14 31.09 14.39C28.35 14.99 24.68 16.65 21.4 16.2Z"/><path d="M18.6 18.2C16.37 22.15 12.23 22.86 8.89 20.61C7.86 19.61 8.38 18.22 10.03 18.28C12.46 18.18 15.86 17.32 18.6 18.2Z"/><path d="M21.4 18.2C23.63 22.15 27.77 22.86 31.11 20.61C32.14 19.61 31.62 18.22 29.97 18.28C27.54 18.18 24.14 17.32 21.4 18.2Z"/><path d="M19.2 20C19.6 22.78 17.83 24.58 15.35 24.6C14.46 24.45 14.19 23.56 15.02 23.02C16.18 22.13 17.52 20.51 19.2 20Z"/><path d="M20.8 20C20.4 22.78 22.17 24.58 24.65 24.6C25.54 24.45 25.81 23.56 24.98 23.02C23.82 22.13 22.48 20.51 20.8 20Z"/><ellipse cx="20" cy="18.4" rx="3.2" ry="2.8"/><path d="M17.6 21.2Q20 24.4 22.4 21.2Z"/></g>
    </g>
    <!-- Chinese: a coin with a square hole between key frets, on a double line. -->
    <g v-else-if="variant === 'chinese'" fill="none" stroke="currentColor" stroke-linecap="square">
      <path d="M10 10.5h80M10 13.5h80M150 10.5h80M150 13.5h80" stroke-width="0.8" />
      <path d="M90 17V7h10v7h-5v-3" stroke-width="1.3" />
      <path d="M150 7v10h-10v-7h5v3" stroke-width="1.3" />
      <path fill="currentColor" stroke="none" fill-rule="evenodd" d="M120 4a8 8 0 1 1-0.01 0zM116.8 8.8h6.4v6.4h-6.4z" />
    </g>
    <!-- Minimal: one fine line and a dot. -->
    <g v-else-if="variant === 'minimal'">
      <path d="M50 12h62M128 12h62" stroke="currentColor" stroke-width="0.8" fill="none" />
      <circle cx="120" cy="12" r="1.8" fill="currentColor" />
    </g>
    <!-- Modern: bold short bars either side of a small square. -->
    <g v-else>
      <path d="M40 12h66M134 12h66" stroke="currentColor" stroke-width="1" fill="none" />
      <path d="M92 12h14M134 12h14" stroke="currentColor" stroke-width="3" fill="none" />
      <rect x="115" y="7" width="10" height="10" fill="currentColor" />
    </g>
  </svg>
</template>

<style scoped>
.divider { width: min(240px, 70%); height: 24px; color: var(--gold); flex-shrink: 0; overflow: visible; }
</style>
