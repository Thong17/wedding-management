<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

/**
 * Golden glowing particles drifting upward, on a canvas filling the parent. `burst` speeds them up and
 * brightens them (while the invitation opens). Paused while off screen or in a hidden tab; a handful of
 * still sparks with "reduce motion".
 */
const props = withDefaults(defineProps<{ color?: string; count?: number; burst?: boolean }>(), {
  color: '#e8c873',
  count: 70,
  burst: false,
})

const canvas = ref<HTMLCanvasElement | null>(null)
interface Spark { x: number; y: number; r: number; vy: number; vx: number; phase: number; speed: number }
let sparks: Spark[] = []
let frame = 0
let visible = true
let observer: IntersectionObserver | null = null
let resizeObserver: ResizeObserver | null = null
const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
let width = 0
let height = 0
let energy = 1 // eases toward 1 (calm) or 3.5 (burst)

function spawn(anywhere: boolean): Spark {
  return {
    x: Math.random() * width,
    y: anywhere ? Math.random() * height : height + 10,
    r: 0.6 + Math.random() * 2.2,
    vy: 0.15 + Math.random() * 0.45,
    vx: (Math.random() - 0.5) * 0.2,
    phase: Math.random() * Math.PI * 2,
    speed: 0.01 + Math.random() * 0.03,
  }
}

function resize() {
  const el = canvas.value
  if (!el) return
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  width = el.clientWidth
  height = el.clientHeight
  el.width = Math.max(1, Math.round(width * dpr))
  el.height = Math.max(1, Math.round(height * dpr))
  el.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0)
  const n = reduced ? Math.min(14, props.count) : props.count
  sparks = Array.from({ length: n }, () => spawn(true))
  if (reduced) draw()
}

function draw() {
  const ctx = canvas.value?.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, width, height)
  energy += ((props.burst ? 3.5 : 1) - energy) * 0.05
  for (const s of sparks) {
    if (!reduced) {
      s.y -= s.vy * energy
      s.x += s.vx * energy + Math.sin(s.phase) * 0.15
      s.phase += s.speed
      if (s.y < -10) Object.assign(s, spawn(false))
    }
    const twinkle = 0.45 + 0.55 * Math.abs(Math.sin(s.phase))
    const glow = s.r * (4 + energy)
    const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, glow)
    g.addColorStop(0, hexA(props.color, Math.min(1, twinkle * (0.55 + energy * 0.12))))
    g.addColorStop(0.35, hexA(props.color, twinkle * 0.18))
    g.addColorStop(1, hexA(props.color, 0))
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(s.x, s.y, glow, 0, Math.PI * 2)
    ctx.fill()
  }
}

function loop() {
  frame = requestAnimationFrame(loop)
  if (visible && !document.hidden) draw()
}

function hexA(hex: string, alpha: number) {
  const n = Number.parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha.toFixed(3)})`
}

onMounted(() => {
  resize()
  if (typeof ResizeObserver !== 'undefined' && canvas.value) {
    resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(canvas.value)
  }
  if (typeof IntersectionObserver !== 'undefined' && canvas.value) {
    observer = new IntersectionObserver(([entry]) => (visible = entry.isIntersecting))
    observer.observe(canvas.value)
  }
  if (!reduced) loop()
})
watch(() => props.count, resize)
onBeforeUnmount(() => {
  cancelAnimationFrame(frame)
  observer?.disconnect()
  resizeObserver?.disconnect()
})
</script>

<template>
  <canvas ref="canvas" class="particles" aria-hidden="true" />
</template>

<style scoped>
.particles { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
</style>
