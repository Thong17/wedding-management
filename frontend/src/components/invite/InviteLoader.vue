<script setup lang="ts">
import { computed } from 'vue'

/**
 * The guest's loading screen: a gold ring that fills as the invitation, its fonts and its pictures
 * arrive, around a softly glowing seal. Matches the screen index.html shows before the app has loaded
 * (#invite-boot), so the hand-over is seamless.
 */
const props = defineProps<{ progress: number; label: string; color?: string }>()

const R = 54
const LENGTH = 2 * Math.PI * R
const offset = computed(() => LENGTH * (1 - Math.min(1, Math.max(0, props.progress))))
const percent = computed(() => Math.round(Math.min(1, Math.max(0, props.progress)) * 100))
</script>

<template>
  <div
    class="loader"
    :style="color ? { '--cover': color } : undefined"
    role="progressbar"
    aria-valuemin="0"
    aria-valuemax="100"
    :aria-valuenow="percent"
    :aria-label="label"
  >
    <div class="ring">
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle cx="60" cy="60" :r="R" class="track" />
        <circle cx="60" cy="60" :r="R" class="fill" :stroke-dasharray="LENGTH" :stroke-dashoffset="offset" />
      </svg>
      <span class="glow" />
      <span class="percent">{{ percent }}%</span>
    </div>
    <p class="label">{{ label }}</p>
  </div>
</template>

<style scoped>
.loader {
  --cover: #6e1423;
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 22px;
  padding: 24px;
  color: #f3dfa6;
  background:
    radial-gradient(ellipse at 50% 42%, rgb(255 255 255 / 0.12), transparent 60%),
    radial-gradient(ellipse at 50% 120%, rgb(0 0 0 / 0.45), transparent 60%),
    var(--cover);
  font-family: Georgia, 'Times New Roman', serif;
}
.ring { position: relative; width: clamp(120px, 34vmin, 168px); aspect-ratio: 1; }
.ring svg { position: absolute; inset: 0; width: 100%; height: 100%; transform: rotate(-90deg); }
.track { fill: none; stroke: rgb(243 223 166 / 0.18); stroke-width: 2; }
.fill {
  fill: none;
  stroke: #e3c06f;
  stroke-width: 2.5;
  stroke-linecap: round;
  transition: stroke-dashoffset 0.35s ease-out;
  filter: drop-shadow(0 0 6px rgb(243 223 166 / 0.6));
}
.glow {
  position: absolute;
  inset: 22%;
  border-radius: 50%;
  background: radial-gradient(circle, rgb(243 223 166 / 0.45), rgb(201 161 74 / 0.12) 60%, transparent 72%);
  animation: glow 1.8s ease-in-out infinite;
}
.percent {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.05rem;
  letter-spacing: 0.08em;
}
.label { margin: 0; font-size: 0.95rem; letter-spacing: 0.06em; opacity: 0.85; text-align: center; }
@keyframes glow { 50% { transform: scale(1.12); opacity: 0.6; } }
@media (prefers-reduced-motion: reduce) {
  .glow { animation: none; }
}
</style>
