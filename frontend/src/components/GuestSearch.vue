<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppSelect from '@/components/AppSelect.vue'
import type { CachedGuest } from '@/offline/db'
import { filterGuests, guestGroups, NO_FILTER, type GuestFilter, type GuestSearcher } from '@/offline/guestSearch'
import { sideLabel, sideOptions } from '@/utils/format'

const PAGE_SIZE = 10

const props = defineProps<{ searcher: GuestSearcher; giftedGuestIds: Set<number | null>; selectedId?: number | null }>()
const emit = defineEmits<{ select: [guest: CachedGuest] }>()
const query = defineModel<string>({ default: '' })
const { t } = useI18n()
const active = ref(0)
const page = ref(1)
const input = ref<HTMLInputElement | null>(null)

// Narrow the list by side and group (family, neighbour…) as well as by the search text.
const filter = ref<GuestFilter>({ ...NO_FILTER })
const filtered = computed(() => filter.value.side !== 'all' || filter.value.group !== 'all')
const sideFilterOptions = computed(() => [{ value: 'all', label: t('search.allSides') }, ...sideOptions()])
const groupOptions = computed(() => [
  { value: 'all', label: t('search.allGroups') },
  ...guestGroups(props.searcher.all()).map((g) => ({ value: g, label: g })),
])

// No query: every guest in name order. With a query: all matches, best first.
const matches = computed(() =>
  filterGuests(
    query.value.trim() ? props.searcher.search(query.value, Number.MAX_SAFE_INTEGER) : props.searcher.all(),
    filter.value,
  ),
)
const pageCount = computed(() => Math.max(1, Math.ceil(matches.value.length / PAGE_SIZE)))
const results = computed(() => matches.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE))
const rangeText = computed(() => {
  if (!matches.value.length) return ''
  const start = (page.value - 1) * PAGE_SIZE + 1
  return t('search.range', { start, end: start + results.value.length - 1, total: matches.value.length })
})

watch([query, () => props.searcher, filter], () => (page.value = 1), { deep: true })
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
    <div class="search-row">
      <input
        ref="input"
        v-model="query"
        type="search"
        :placeholder="t('search.placeholder')"
        autocomplete="off"
        autocapitalize="off"
        enterkeyhint="search"
        @keydown="onKey"
      />
      <!-- Buttons beside the search box, e.g. refreshing the guest list. -->
      <slot name="actions" />
    </div>
    <div class="row filters">
      <AppSelect v-model="filter.side" :options="sideFilterOptions" :aria-label="t('search.side')" />
      <AppSelect v-if="groupOptions.length > 1" v-model="filter.group" :options="groupOptions" :aria-label="t('search.group')" />
      <button v-if="filtered" type="button" class="btn-small clear-filters" @click="filter = { ...NO_FILTER }">{{ t('search.clearFilters') }}</button>
    </div>
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
          <span v-if="giftedGuestIds.has(g.id)" class="badge badge-synced" :title="t('search.giftedTitle')">{{ t('search.gifted') }}</span>
        </div>
        <div class="muted small">
          {{ sideLabel(g.side) }}<span v-if="g.group"> · {{ g.group }}</span><span v-if="g.table_no"> · {{ t('common.table', { n: g.table_no }) }}</span><span v-if="g.phone"> · {{ g.phone }}</span>
        </div>
      </li>
      <li v-if="!results.length" class="muted small empty">
        {{ query.trim() ? t('search.noMatch') : filtered ? t('search.noFilterMatch') : t('search.noGuests') }}
      </li>
    </ul>
    <div v-if="matches.length > PAGE_SIZE" class="row pager">
      <button type="button" class="btn-small" :disabled="page === 1" @click="goTo(page - 1)" :aria-label="t('search.prevPage')">{{ t('search.prev') }}</button>
      <span class="muted small">{{ t('search.page', { page, count: pageCount }) }}</span>
      <button type="button" class="btn-small" :disabled="page === pageCount" @click="goTo(page + 1)" :aria-label="t('search.nextPage')">{{ t('search.next') }}</button>
      <span class="spacer" />
      <span class="muted small">{{ rangeText }}</span>
    </div>
    <div v-else-if="matches.length" class="muted small">{{ rangeText }}</div>
  </div>
</template>

<style scoped>
.results { border: 1px solid var(--c-border); border-radius: var(--radius-md); overflow: hidden; }
.results li { padding: 10px 12px; cursor: pointer; }
.results li.active { background: var(--c-primary-soft); }
.results li.selected { box-shadow: inset 3px 0 0 var(--c-primary); }
.results li.empty { cursor: default; }
.pager { gap: 8px; }
.search-row { display: flex; gap: 8px; align-items: center; }
.search-row input { flex: 1; min-width: 0; }
.filters > :deep(.app-select) { flex: 1 1 140px; min-width: 0; }
</style>
