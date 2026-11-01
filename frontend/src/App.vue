<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import SyncStatusBadge from '@/components/SyncStatusBadge.vue'
import { useAuthStore } from '@/stores/auth'
import { useSyncStore } from '@/stores/sync'
import { toasts } from '@/utils/toast'

const auth = useAuthStore()
const sync = useSyncStore()
const route = useRoute()
const router = useRouter()

function logout() {
  const unsynced = sync.unsynced + sync.counts.failed
  if (
    unsynced > 0 &&
    !confirm(
      `${unsynced} gift(s) on this device are not on the server yet. They stay saved on this device and upload after you log in again. Log out?`,
    )
  )
    return
  auth.logout()
  router.push({ name: 'login' })
}
</script>

<template>
  <header class="app-header no-print" v-if="route.name !== 'login'">
    <div class="container row header-inner">
      <RouterLink to="/" class="brand">💝 Gift Desk</RouterLink>
      <nav class="row">
        <RouterLink to="/">Events</RouterLink>
        <RouterLink to="/sync">Sync</RouterLink>
      </nav>
      <span class="spacer" />
      <SyncStatusBadge />
      <span v-if="auth.user" class="muted small user">{{ auth.user.username }}</span>
      <button v-if="auth.user" class="btn-small" @click="logout">Log out</button>
    </div>
  </header>

  <div v-if="auth.sessionExpired && route.name !== 'login'" class="container no-print">
    <div class="banner banner-warn row">
      <span>Your session expired. Gifts keep saving on this device, but uploading is paused.</span>
      <span class="spacer" />
      <RouterLink class="btn btn-small" :to="{ name: 'login', query: { next: route.fullPath } }">Log in again</RouterLink>
    </div>
  </div>

  <main>
    <RouterView />
  </main>

  <div class="toasts" aria-live="polite">
    <div v-for="t in toasts" :key="t.id" class="toast" :class="`toast-${t.kind}`">{{ t.message }}</div>
  </div>
</template>

<style scoped>
.app-header {
  background: var(--c-surface);
  border-bottom: 1px solid var(--c-border);
  position: sticky;
  top: 0;
  z-index: 10;
}
.header-inner { padding-top: 8px; padding-bottom: 8px; }
.brand { font-weight: 700; text-decoration: none; color: var(--c-text); margin-right: 8px; }
nav a { text-decoration: none; color: var(--c-muted); padding: 6px 8px; border-radius: 6px; }
nav a.router-link-exact-active { color: var(--c-primary); background: var(--c-primary-soft); }
@media (max-width: 540px) { .user { display: none; } }
.toasts {
  position: fixed;
  left: 50%;
  bottom: calc(16px + env(safe-area-inset-bottom));
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 50;
  width: min(420px, calc(100vw - 32px));
}
.toast { padding: 12px 16px; border-radius: 10px; font-weight: 600; box-shadow: 0 4px 16px rgb(0 0 0 / 0.18); }
.toast-ok { background: var(--c-ok); color: #fff; }
.toast-info { background: var(--c-info); color: #fff; }
.toast-error { background: var(--c-danger); color: #fff; }
</style>
