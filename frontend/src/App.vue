<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import AppBreadcrumbs from '@/components/AppBreadcrumbs.vue'
import LanguageSwitch from '@/components/LanguageSwitch.vue'
import SyncStatusBadge from '@/components/SyncStatusBadge.vue'
import ThemeSwitch from '@/components/ThemeSwitch.vue'
import UserMenu from '@/components/UserMenu.vue'
import { useAuthStore } from '@/stores/auth'
import { toasts } from '@/utils/toast'

const auth = useAuthStore()
const route = useRoute()
const { t } = useI18n()
</script>

<template>
  <header class="app-header no-print" v-if="route.name !== 'login'">
    <div class="container row header-inner">
      <RouterLink to="/" class="brand">💝 {{ t('app.brand') }}</RouterLink>
      <nav class="row">
        <RouterLink to="/">{{ t('app.events') }}</RouterLink>
        <RouterLink to="/sync">{{ t('app.sync') }}</RouterLink>
        <!-- Moves into the admin sidebar in step 3 of docs/accounts-plan.md. -->
        <RouterLink v-if="auth.isManager" to="/roles">{{ t('app.roles') }}</RouterLink>
      </nav>
      <span class="spacer" />
      <SyncStatusBadge />
      <ThemeSwitch />
      <LanguageSwitch />
      <UserMenu />
    </div>
  </header>

  <div v-if="auth.sessionExpired && route.name !== 'login'" class="container no-print">
    <div class="banner banner-warn row">
      <span>{{ t('app.sessionExpired') }}</span>
      <span class="spacer" />
      <RouterLink class="btn btn-small" :to="{ name: 'login', query: { next: route.fullPath } }">{{ t('app.loginAgain') }}</RouterLink>
    </div>
  </div>

  <main>
    <AppBreadcrumbs v-if="route.name !== 'login'" />
    <RouterView />
  </main>

  <div class="toasts" aria-live="polite">
    <div v-for="msg in toasts" :key="msg.id" class="toast" :class="`toast-${msg.kind}`">{{ msg.message }}</div>
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
.header-inner { padding-top: 16px; padding-bottom: 16px; }
.brand { font-weight: 700; text-decoration: none; color: var(--c-text); margin-right: 8px; }
nav a { text-decoration: none; color: var(--c-muted); padding: 6px 8px; border-radius: var(--radius-sm); }
nav a.router-link-exact-active { color: var(--c-primary); background: var(--c-primary-soft); }
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
.toast { padding: 12px 16px; border-radius: var(--radius); font-weight: 600; box-shadow: 0 4px 16px rgb(0 0 0 / 0.18); }
.toast-ok { background: var(--c-ok); color: var(--c-toast-ink); }
.toast-info { background: var(--c-info); color: var(--c-toast-ink); }
.toast-error { background: var(--c-danger); color: var(--c-toast-ink); }
</style>
