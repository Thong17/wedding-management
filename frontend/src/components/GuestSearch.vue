<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { CachedGuest } from '@/offline/db'
import type { GuestSearcher } from '@/offline/guestSearch'
import { SIDE_LABELS } from '@/utils/format'

const PAGE_SIZE = 10

const props = defineProps<{ searcher: GuestSearcher; giftedGuestIds: Set<number | null>; selectedId?: number | null }>()
const emit = defineEmits<{ select: [guest: CachedGuest] }>()
const query = defineModel<string>({ default: '' })
const active = ref(0)
const page = ref(1)
const input = ref<HTMLInputElement | null>(null)

// No query: every guest in name order. With a query: all matches, best first.
const matches = computed(() =>
  query.value.trim() ? props.searcher.search(query.value, Number.MAX_SAFE_INTEGER) : props.searcher.all(),
)
const pageCount = computed(() => Math.max(1, Math.ceil(matches.value.length / PAGE_SIZE)))
const results = computed(() => matches.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE))
const rangeText = computed(() => {
  if (!matches.value.length) return ''
  const start = (page.value - 1) * PAGE_SIZE + 1
  return `${start}–${start + results.value.length - 1} of ${matches.value.length}`
})

watch([query, () => props.searcher], () => (page.value = 1))
watch(results, () => (active.value = 0))

function goTo(p: number) {
  page.value = Math.min(Math.max(1, p), pageCount.value)
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') {
    if (active.value < results.value.length - 1) active.value++
    else if (page.value < pageCount.value) goTo(page.value + 1)
  } else if (e.key === 'ArrowUp') {
    if (active.value > 0) active.value--
    else if (page.value > 1) {
      goTo(page.value - 1)
      setTimeout(() => (active.value = results.value.length - 1))
    }
  } else if (e.key === 'PageDown') goTo(page.value + 1)
  else if (e.key === 'PageUp') goTo(page.value - 1)
  else if (e.key === 'Enter' && results.value[active.value]) emit('select', results.value[active.value])
  else return
  e.preventDefault()
}

defineExpose({ focus: () => input.value?.focus() })
</script>

<template>
  <div class="stack">
    <input
      ref="input"
      v-model="query"
      type="search"
      placeholder="Search name, nickname or phone…"
      autocomplete="off"
      autocapitalize="off"
      enterkeyhint="search"
      @keydown="onKey"
    />
    <ul class="list results">
      <li
        v-for="(g, i) in results"
        :key="g.id"
        :class="{ active: i === active, selected: g.id === selectedId }"
        @click="emit('select', g)"
        @mouseenter="active = i"
      >
        <div class="row">
          <strong>{{ g.full_name }}</strong>
          <span v-if="g.nickname" class="muted small">“{{ g.nickname }}”</span>
          <span class="spacer" />
          <span v-if="giftedGuestIds.has(g.id)" class="badge badge-synced" title="A gift is already recorded on this device">✓ gift recorded</span>
        </div>
        <div class="muted small">
          {{ SIDE_LABELS[g.side] }}<span v-if="g.group"> · {{ g.group }}</span><span v-if="g.table_no"> · Table {{ g.table_no }}</span><span v-if="g.phone"> · {{ g.phone }}</span>
        </div>
      </li>
      <li v-if="!results.length" class="muted small empty">
        {{ query.trim() ? 'No matching guest. You can record it as a walk-in guest.' : 'No guests saved on this device yet.' }}
      </li>
    </ul>
    <div v-if="matches.length > PAGE_SIZE" class="row pager">
      <button type="button" class="btn-small" :disabled="page === 1" @click="goTo(page - 1)" aria-label="Previous page">‹ Prev</button>
      <span class="muted small">Page {{ page }} / {{ pageCount }}</span>
      <button type="button" class="btn-small" :disabled="page === pageCount" @click="goTo(page + 1)" aria-label="Next page">Next ›</button>
      <span class="spacer" />
      <span class="muted small">{{ rangeText }}</span>
    </div>
    <div v-else-if="matches.length" class="muted small">{{ rangeText }}</div>
  </div>
</template>

<style scoped>
.results { border: 1px solid var(--c-border); border-radius: var(--radius-md); }
.results li { padding: 10px 12px; cursor: pointer; }
.results li.active { background: var(--c-primary-soft); }
.results li.selected { box-shadow: inset 3px 0 0 var(--c-primary); }
.results li.empty { cursor: default; }
.pager { gap: 8px; }
</style>
