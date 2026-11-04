<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import AppBreadcrumbs from '@/components/AppBreadcrumbs.vue'
import AppIcon from '@/components/AppIcon.vue'
import AppSidebar from '@/components/AppSidebar.vue'
import LanguageSwitch from '@/components/LanguageSwitch.vue'
import LockScreen from '@/components/LockScreen.vue'
import TrialBanner from '@/components/TrialBanner.vue'
import SyncStatusBadge from '@/components/SyncStatusBadge.vue'
import ThemeSwitch from '@/components/ThemeSwitch.vue'
import UserMenu from '@/components/UserMenu.vue'
import { useAuthStore } from '@/stores/auth'
import { toasts } from '@/utils/toast'

const auth = useAuthStore()
const route = useRoute()
const { t } = useI18n()

// A locked login sees only the lock screen; the Sync center stays open so this device's gifts are never stuck.
const locked = computed(() => !!auth.lockReason && route.name !== 'login' && route.name !== 'sync')
// Admins (platform and client) get a sidebar; customers keep the simple top bar.
const withSidebar = computed(() => auth.isManager && !auth.lockReason && route.name !== 'login')
const drawerOpen = ref(false)
watch(() => route.fullPath, () => (drawerOpen.value = false))

// The sidebar sticks just below the sticky header, whose height varies (language, wrapping on phones).
const header = ref<HTMLElement | null>(null)
let observer: ResizeObserver | null = null
onMounted(() => {
  if (typeof ResizeObserver === 'undefined') return
  observer = new ResizeObserver(([entry]) =>
    document.documentElement.style.setProperty('--header-height', `${Math.round(entry.target.getBoundingClientRect().height)}px`),
  )
  watch(header, (el, old) => {
    if (old) observer?.unobserve(old)
    if (el) observer?.observe(el)
  }, { immediate: true })
})
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <header ref="header" class="app-header no-print" v-if="route.name !== 'login'">
    <div class="container row header-inner">
      <button v-if="withSidebar" type="button" class="btn-icon menu-btn" :aria-label="t('nav.open')" :aria-expanded="drawerOpen" @click="drawerOpen = !drawerOpen">
        <AppIcon name="menu" />
      </button>
      <RouterLink to="/" class="brand">💝 {{ t('app.brand') }}</RouterLink>
      <nav v-if="!withSidebar" class="row">
        <RouterLink to="/">{{ t('app.events') }}</RouterLink>
        <RouterLink to="/sync">{{ t('app.sync') }}</RouterLink>
      </nav>
      <span class="spacer" />
      <SyncStatusBadge />
      <!-- Phones: language and theme are in the avatar menu instead (UserMenu). -->
      <span class="wide-only row"><ThemeSwitch /><LanguageSwitch /></span>
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

  <TrialBanner v-if="route.name !== 'login'" />

  <LockScreen v-if="locked" />
  <div v-else class="layout" :class="{ 'with-sidebar': withSidebar }">
    <AppSidebar v-if="withSidebar" :open="drawerOpen" @close="drawerOpen = false" />
    <main>
      <AppBreadcrumbs v-if="route.name !== 'login'" />
      <RouterView />
    </main>
  </div>

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
.layout.with-sidebar { display: flex; align-items: flex-start; }
.layout.with-sidebar main { flex: 1; min-width: 0; }
.menu-btn { display: none; width: 40px; min-height: 40px; height: 40px; }
@media (max-width: 899px) {
  .menu-btn { display: inline-flex; }
}
@media (max-width: 599px) {
  .wide-only { display: none; }
}
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
