<script setup lang="ts">
import AppIcon from '@/components/AppIcon.vue'

/** A short explanatory note: icon at the top left, and a thin accent line inset inside the left edge. */
withDefaults(defineProps<{ icon?: 'info' }>(), { icon: 'info' })
</script>

<template>
  <div class="note" role="note">
    <AppIcon :name="icon" :size="18" class="note-icon" />
    <p class="note-text"><slot /></p>
  </div>
</template>

<style scoped>
.note {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px 10px 16px;
  border-radius: var(--radius-md);
  overflow: hidden; /* the line's ends follow the rounded corners */
  background: var(--c-info-soft);
  color: var(--c-text);
  font-size: 0.88rem;
}
.note::before {
  content: '';
  position: absolute;
  left: 6px;
  top: 10px;
  bottom: 10px;
  width: 3px;
  border-radius: 999px;
  corner-shape: round;
  background: var(--c-info);
}
.note-icon { flex-shrink: 0; margin-top: 1px; color: var(--c-info); }
.note-text { margin: 0; }
</style>
