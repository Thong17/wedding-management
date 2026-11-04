<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/AppIcon.vue'
import AppTooltip from '@/components/AppTooltip.vue'
import { useSyncStore } from '@/stores/sync'

const sync = useSyncStore()
const { t } = useI18n()

// Phones show only the icon (its colour carries the state); the text stays as tooltip and label.
const view = computed(() => {
  const { pending, syncing, failed } = sync.counts
  const n = pending + syncing
  if (sync.state === 'auth-required')
    return { cls: 'badge-failed', icon: 'lock', text: n ? t('badge.loginToSyncCount', { n }) : t('badge.loginToSync') } as const
  if (sync.state === 'syncing' || syncing) return { cls: 'badge-syncing', icon: 'sync', text: t('badge.syncing', { n }) } as const
  if (failed) return { cls: 'badge-failed', icon: 'alert', text: t('badge.failed', { n: failed }) } as const
  if (!sync.browserOnline || sync.state === 'offline')
    return { cls: 'badge-pending', icon: 'cloud-off', text: n ? t('badge.offlineSaved', { n }) : t('badge.offline') } as const
  if (sync.state === 'error') return { cls: 'badge-pending', icon: 'alert', text: t('badge.unreachable', { n }) } as const
  if (n) return { cls: 'badge-pending', icon: 'clock', text: t('badge.waiting', { n }) } as const
  return { cls: 'badge-synced', icon: 'check', text: t('badge.allSynced') } as const
})
</script>

<template>
  <AppTooltip :text="sync.snapshot.lastError ?? view.text" side="bottom">
    <RouterLink to="/sync" class="badge sync-badge" :class="view.cls" :aria-label="view.text">
      <AppIcon :name="view.icon" :size="14" class="sync-icon" :class="{ spinning: view.icon === 'sync' }" />
      <span class="sync-text">{{ view.text }}</span>
    </RouterLink>
  </AppTooltip>
</template>

<style scoped>
a { text-decoration: none; }
.sync-badge { display: inline-flex; align-items: center; gap: 5px; }
.sync-icon { flex-shrink: 0; }
.spinning { animation: sync-spin 1.2s linear infinite; }
@keyframes sync-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .spinning { animation: none; } }

/* Phones: a round icon-only chip. */
@media (max-width: 599px) {
  .sync-text { display: none; }
  .sync-badge { width: 32px; height: 32px; padding: 0; justify-content: center; border-radius: 50%; corner-shape: round; }
  .sync-icon { width: 16px; height: 16px; }
}
</style>
