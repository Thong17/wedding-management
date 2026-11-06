<script setup lang="ts">
/**
 * Grey placeholder shapes shown while something loads, roughly the size of what will replace them.
 * - `card`: a title, a meta line and buttons (events, roles);
 * - `row`: one table row with `columns` cells (use inside <tbody>);
 * - `list`: a gift-list style item, two lines;
 * - `page`: a page heading and a card of text, for a page that has nothing to show yet.
 * Hidden from screen readers; the container gets aria-busy instead.
 */
withDefaults(defineProps<{ variant?: 'card' | 'row' | 'list' | 'page'; columns?: number }>(), {
  variant: 'card',
  columns: 4,
})

// Varied widths so rows don't look like a ruled sheet.
const WIDTHS = ['70%', '45%', '60%', '35%', '55%', '40%', '65%']
</script>

<template>
  <tr v-if="variant === 'row'" class="skeleton-row skeleton-appear" aria-hidden="true">
    <td v-for="i in columns" :key="i"><span class="skeleton skeleton-text" :style="{ width: WIDTHS[i % WIDTHS.length] }" /></td>
  </tr>
  <div v-else-if="variant === 'list'" class="skeleton-list skeleton-appear" aria-hidden="true">
    <span class="skeleton skeleton-text" style="width: 55%" />
    <span class="skeleton skeleton-text small" style="width: 35%" />
  </div>
  <div v-else-if="variant === 'page'" class="stack skeleton-appear" aria-hidden="true">
    <span class="skeleton skeleton-title" style="width: min(320px, 70%)" />
    <span class="skeleton skeleton-text small" style="width: min(220px, 50%)" />
    <div class="card stack">
      <span class="skeleton skeleton-text" style="width: 40%" />
      <span v-for="i in 4" :key="i" class="skeleton skeleton-text" :style="{ width: WIDTHS[i] }" />
    </div>
  </div>
  <div v-else class="stack skeleton-appear" aria-hidden="true">
    <span class="skeleton skeleton-title" style="width: 60%" />
    <span class="skeleton skeleton-text small" style="width: 40%" />
    <div class="row">
      <span class="skeleton skeleton-button" />
      <span class="skeleton skeleton-button" />
    </div>
  </div>
</template>

<style scoped>
.skeleton-list { display: flex; flex-direction: column; gap: 8px; padding: 12px 0; }
.skeleton-row td { padding-block: 14px; }
</style>
