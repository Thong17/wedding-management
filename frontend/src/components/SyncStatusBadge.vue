<script setup lang="ts">
import { computed } from 'vue'
import { useSyncStore } from '@/stores/sync'

const sync = useSyncStore()

const view = computed(() => {
  const { pending, syncing, failed } = sync.counts
  const queued = pending + syncing
  if (sync.state === 'auth-required') return { cls: 'badge-failed', text: `Log in to sync${queued ? ` (${queued})` : ''}` }
  if (sync.state === 'syncing' || syncing) return { cls: 'badge-syncing', text: `Syncing ${queued}…` }
  if (failed) return { cls: 'badge-failed', text: `${failed} failed` }
  if (!sync.browserOnline || sync.state === 'offline') return { cls: 'badge-pending', text: queued ? `Offline · ${queued} saved locally` : 'Offline' }
  if (sync.state === 'error') return { cls: 'badge-pending', text: `Server unreachable · ${queued} queued` }
  if (queued) return { cls: 'badge-pending', text: `${queued} waiting` }
  return { cls: 'badge-synced', text: 'All synced' }
})
</script>

<template>
  <RouterLink to="/sync" class="badge" :class="view.cls" :title="sync.snapshot.lastError ?? 'Open sync center'">
    {{ view.text }}
  </RouterLink>
</template>

<style scoped>
a { text-decoration: none; }
</style>
