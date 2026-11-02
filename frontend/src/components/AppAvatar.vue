<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const props = defineProps<{ name: string; src?: string | null; size?: number }>()

// Falls back to initials when there is no picture, or it can't load (e.g. offline and not cached yet).
const failed = ref(false)
watch(
  () => props.src,
  () => (failed.value = false),
)

const initials = computed(() => {
  const parts = props.name.trim().split(/[\s._-]+/).filter(Boolean)
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : props.name.trim().slice(0, 2)
  return letters.toUpperCase()
})
// Same name, same colour: a stable hue from the name keeps avatars recognisable.
const hue = computed(() => [...props.name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 0))
const px = computed(() => `${props.size ?? 36}px`)
</script>

<template>
  <span class="avatar" :style="{ width: px, height: px, '--avatar-hue': hue }" aria-hidden="true">
    <img v-if="src && !failed" :src="src" alt="" @error="failed = true" />
    <span v-else class="initials">{{ initials }}</span>
  </span>
</template>

<style scoped>
.avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
  border-radius: 50%;
  corner-shape: round;
  background: hsl(var(--avatar-hue) 45% 88%);
  color: hsl(var(--avatar-hue) 45% 28%);
  font-weight: 700;
  user-select: none;
}
.avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
.initials { font-size: calc(v-bind(px) * 0.4); line-height: 1; }
</style>
