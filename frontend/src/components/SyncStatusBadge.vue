<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSyncStore } from '@/stores/sync'

const sync = useSyncStore()
const { t } = useI18n()

const view = computed(() => {
  const { pending, syncing, failed } = sync.counts
  const n = pending + syncing
  if (sync.state === 'auth-required') return { cls: 'badge-failed', text: n ? t('badge.loginToSyncCount', { n }) : t('badge.loginToSync') }
  if (sync.state === 'syncing' || syncing) return { cls: 'badge-syncing', text: t('badge.syncing', { n }) }
  if (failed) return { cls: 'badge-failed', text: t('badge.failed', { n: failed }) }
  if (!sync.browserOnline || sync.state === 'offline') return { cls: 'badge-pending', text: n ? t('badge.offlineSaved', { n }) : t('badge.offline') }
  if (sync.state === 'error') return { cls: 'badge-pending', text: t('badge.unreachable', { n }) }
  if (n) return { cls: 'badge-pending', text: t('badge.waiting', { n }) }
  return { cls: 'badge-synced', text: t('badge.allSynced') }
})
</script>

<template>
  <RouterLink to="/sync" class="badge" :class="view.cls" :title="sync.snapshot.lastError ?? t('badge.openSync')">
    {{ view.text }}
  </RouterLink>
</template>

<style scoped>
a { text-decoration: none; }
</style>
