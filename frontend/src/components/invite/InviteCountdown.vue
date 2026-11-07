<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { kmDigits, type InviteLabels } from '@/invite/labels'
import type { InviteLanguage } from '@/invite/config'

/**
 * A large countdown to the wedding: days, hours, minutes and seconds, each in a frame of the
 * invitation's style. On the day it says so instead; a day later it disappears.
 */
const props = defineProps<{
  /** When the wedding starts (ms since 1970). */
  target: number
  labels: InviteLabels
  language: InviteLanguage
  /** The boxes in the ornate gold frame, or a plain one. */
  ornate: boolean
  numbersFont: string
}>()

const DAY = 86_400_000
const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  timer = setInterval(() => {
    now.value = Date.now()
    if (now.value > props.target + DAY) clearInterval(timer)
  }, 1000)
})
onBeforeUnmount(() => clearInterval(timer))

const left = computed(() => props.target - now.value)
const digits = (n: number, pad = 2) => {
  const text = String(n).padStart(pad, '0')
  return props.language === 'km' ? kmDigits(text) : text
}
const units = computed(() => {
  const ms = Math.max(0, left.value)
  return [
    { value: digits(Math.floor(ms / DAY), 1), label: props.labels.days },
    { value: digits(Math.floor(ms / 3_600_000) % 24), label: props.labels.hours },
    { value: digits(Math.floor(ms / 60_000) % 60), label: props.labels.minutes },
    { value: digits(Math.floor(ms / 1000) % 60), label: props.labels.seconds },
  ]
})
</script>

<template>
  <section v-if="left > -DAY" class="countdown">
    <h2 class="small-caps">{{ labels.countdownTitle }}</h2>
    <p v-if="left <= 0" class="today" :style="{ fontFamily: numbersFont }">{{ labels.countdownToday }}</p>
    <div v-else class="units" role="timer" aria-live="off">
      <div v-for="unit in units" :key="unit.label" class="unit invite-frame" :class="{ 'invite-ornate': ornate }">
        <span class="value" :style="{ fontFamily: numbersFont }">{{ unit.value }}</span>
        <span class="label">{{ unit.label }}</span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.countdown {
  margin: clamp(28px, 6cqi, 56px) auto 0;
  max-width: 620px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}
.small-caps { font-size: 0.75em; letter-spacing: 0.22em; text-transform: uppercase; color: var(--gold); font-weight: 600; margin: 0; }
.small-caps:lang(km) { letter-spacing: 0; text-transform: none; }
.units {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: clamp(8px, 2.6cqi, 18px);
  width: 100%;
}
.unit {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: clamp(12px, 3.4cqi, 20px) 4px clamp(10px, 2.6cqi, 16px);
  border-radius: var(--r-md, 12px);
  background-color: color-mix(in srgb, var(--paper) 90%, #fff);
  --ornate-corner: clamp(11px, 3cqi, 16px);
  --ornate-shadow: 0 10px 26px color-mix(in srgb, var(--ink) 10%, transparent);
}
.value {
  font-size: clamp(2rem, 10cqi, 3.8rem);
  line-height: 1.1;
  font-weight: 500;
  color: var(--gold);
  font-variant-numeric: tabular-nums;
}
/* Khmer digits are much wider: smaller, so two fit in a box on a phone. */
.value:lang(km) { font-size: clamp(1.35rem, 6.4cqi, 3.2rem); line-height: 1.4; }
.label { font-size: 0.8em; opacity: 0.8; }
.today { margin: 0; font-size: clamp(1.4rem, 6cqi, 2.2rem); color: var(--gold); line-height: 1.6; }
</style>
