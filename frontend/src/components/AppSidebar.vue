<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import { useAuthStore } from '@/stores/auth'

/** Navigation for platform admins and client admins. On narrow screens it is a drawer (`open`). */
defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()
const auth = useAuthStore()
const route = useRoute()
const { t } = useI18n()

type Icon = 'calendar' | 'building' | 'users' | 'shield' | 'briefcase' | 'sync'
interface Item {
  to: string
  label: string
  icon: Icon
  /** Paths that also count as this section (e.g. an event page under Events). */
  match: (path: string) => boolean
}

const startsWith = (...prefixes: string[]) => (path: string) => prefixes.some((p) => path === p || path.startsWith(`${p}/`))

const items = computed<Item[]>(() => {
  const events: Item = { to: '/', label: t('nav.events'), icon: 'calendar', match: (p) => p === '/' || startsWith('/events')(p) }
  const roles: Item = { to: '/roles', label: t('nav.roles'), icon: 'shield', match: startsWith('/roles') }
  const sync: Item = { to: '/sync', label: t('nav.sync'), icon: 'sync', match: startsWith('/sync') }
  if (auth.isPlatformAdmin) {
    return [
      events,
      { to: '/clients', label: t('nav.clients'), icon: 'building', match: startsWith('/clients') },
      { to: '/users', label: t('nav.users'), icon: 'users', match: startsWith('/users') },
      roles,
      sync,
    ]
  }
  return [
    events,
    { to: '/customers', label: t('nav.customers'), icon: 'users', match: startsWith('/customers') },
    roles,
    { to: '/business', label: t('nav.business'), icon: 'briefcase', match: startsWith('/business') },
    sync,
  ]
})
</script>

<template>
  <div v-if="open" class="scrim" @click="emit('close')" />
  <aside class="sidebar no-print" :class="{ open }" :aria-label="t('nav.label')">
    <div v-if="auth.user?.client" class="client muted small">{{ auth.user.client.business_name }}</div>
    <nav class="items">
      <RouterLink
        v-for="item in items"
        :key="item.to"
        :to="item.to"
        class="item"
        :class="{ active: item.match(route.path) }"
        :aria-current="item.match(route.path) ? 'page' : undefined"
        @click="emit('close')"
      >
        <AppIcon :name="item.icon" />
        <span>{{ item.label }}</span>
      </RouterLink>
    </nav>
  </aside>
</template>

<style scoped>
.sidebar {
  width: 232px;
  flex-shrink: 0;
  padding: 16px 12px;
  border-right: 1px solid var(--c-border);
  background: var(--c-surface);
  position: sticky;
  top: var(--header-height, 70px);
  height: calc(100vh - var(--header-height, 70px));
  overflow-y: auto;
}
.client { padding: 0 10px 10px; font-weight: 600; overflow-wrap: anywhere; }
.items { display: flex; flex-direction: column; gap: 2px; }
.item {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 44px;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  color: var(--c-muted);
  text-decoration: none;
  font-weight: 500;
}
.item:hover { background: var(--c-bg); color: var(--c-text); }
.item.active { background: var(--c-primary-soft); color: var(--c-primary); font-weight: 600; }
.scrim { display: none; }

/* Narrow screens: a drawer over the page, opened from the header's menu button. */
@media (max-width: 899px) {
  .sidebar {
    position: fixed;
    z-index: 30;
    top: 0;
    left: 0;
    height: 100vh;
    padding-top: calc(16px + env(safe-area-inset-top));
    transform: translateX(-100%);
    transition: transform 0.2s ease;
    box-shadow: 0 8px 24px rgb(0 0 0 / 0.18);
  }
  .sidebar.open { transform: none; }
  .scrim { display: block; position: fixed; inset: 0; z-index: 29; background: rgb(0 0 0 / 0.35); }
}
</style>
