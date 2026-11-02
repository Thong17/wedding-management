<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter, type RouteLocationRaw } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import { getCachedEvent } from '@/offline/guestCache'
import { EVENT_CRUMB } from '@/router'
import { useEventsStore } from '@/stores/events'

const route = useRoute()
const router = useRouter()
const events = useEventsStore()

const eventId = computed(() => (route.params.id ? Number(route.params.id) : null))
const fetchedName = ref<string | null>(null)

// Prefer names already in memory or on this device so crumbs resolve offline without a request.
watch(
  eventId,
  async (id) => {
    fetchedName.value = null
    if (id == null || events.events.some((e) => e.id === id)) return
    const name = (await getCachedEvent(id))?.name ?? (await events.getEvent(id)).event?.name
    if (eventId.value === id) fetchedName.value = name ?? null
  },
  { immediate: true },
)

const eventName = computed(
  () => events.events.find((e) => e.id === eventId.value)?.name ?? fetchedName.value ?? 'Event',
)

/** Walk the parent chain from the current route up to the root. */
const crumbs = computed(() => {
  const list: { label: string; to: RouteLocationRaw }[] = []
  let name: string | undefined = route.name as string | undefined
  while (name) {
    const target = router.resolve({ name, params: route.params })
    const label = target.meta.crumb
    if (!label) break
    list.unshift({ label: label === EVENT_CRUMB ? eventName.value : label, to: target })
    name = target.meta.parent
  }
  return list
})

const parent = computed(() => crumbs.value.at(-2))
</script>

<template>
  <nav v-if="parent" class="container row crumbs no-print" aria-label="Breadcrumb">
    <RouterLink class="btn btn-icon back" :to="parent.to" :title="`Back to ${parent.label}`" :aria-label="`Back to ${parent.label}`">
      <AppIcon name="chevron-left" />
    </RouterLink>
    <ol class="row">
      <li v-for="(c, i) in crumbs" :key="i" class="row">
        <AppIcon v-if="i > 0" name="chevron-right" :size="14" class="sep" />
        <span v-if="i === crumbs.length - 1" aria-current="page">{{ c.label }}</span>
        <RouterLink v-else :to="c.to">{{ c.label }}</RouterLink>
      </li>
    </ol>
  </nav>
</template>

<style scoped>
.crumbs { padding-bottom: 0; flex-wrap: nowrap; }
.back { width: 36px; min-height: 36px; height: 36px; border-radius: 50%; corner-shape: round; flex-shrink: 0; }
ol { list-style: none; margin: 0; padding: 0; gap: 4px; min-width: 0; font-size: 0.92rem; }
li { gap: 4px; min-width: 0; }
li a { color: var(--c-muted); text-decoration: none; }
li a:hover { color: var(--c-primary); text-decoration: underline; }
li span { font-weight: 600; overflow-wrap: anywhere; }
.sep { color: var(--c-muted); flex-shrink: 0; }
</style>
