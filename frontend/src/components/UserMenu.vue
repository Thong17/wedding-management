<script setup lang="ts">
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from 'reka-ui'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import AppAvatar from '@/components/AppAvatar.vue'
import AppIcon from '@/components/AppIcon.vue'
import { useAuthStore } from '@/stores/auth'
import { useSyncStore } from '@/stores/sync'

const auth = useAuthStore()
const sync = useSyncStore()
const router = useRouter()
const { t } = useI18n()

function logout() {
  const unsynced = sync.unsynced + sync.counts.failed
  if (unsynced > 0 && !confirm(t('app.logoutConfirm', unsynced))) return
  auth.logout()
  router.push({ name: 'login' })
}
</script>

<template>
  <DropdownMenuRoot v-if="auth.user">
    <DropdownMenuTrigger class="user-trigger" :aria-label="t('user.menu', { name: auth.user.username })">
      <span class="user-trigger-name">{{ auth.user.username }}</span>
      <AppAvatar :name="auth.user.username" :src="auth.user.avatar_url" :size="30" />
    </DropdownMenuTrigger>
    <DropdownMenuPortal>
      <DropdownMenuContent class="menu user-menu" align="end" :side-offset="6">
        <DropdownMenuLabel class="menu-label">
          <AppAvatar :name="auth.user.username" :src="auth.user.avatar_url" :size="40" />
          <span class="user-name">{{ auth.user.username }}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator class="menu-sep" />
        <DropdownMenuItem class="menu-item" @select="router.push({ name: 'profile' })">
          <AppIcon name="user" :size="16" />{{ t('user.profile') }}
        </DropdownMenuItem>
        <DropdownMenuItem class="menu-item danger" @select="logout">
          <AppIcon name="logout" :size="16" />{{ t('app.logout') }}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>

<style>
/* Unscoped: the menu is portalled to <body>, outside this component's scope. */
/* A pill: username on the left, avatar on the right, one shared border. */
.user-trigger {
  gap: 8px;
  min-height: 36px;
  max-width: 220px;
  padding: 2px 2px 2px 12px;
  border-radius: 999px;
  corner-shape: round;
  font-weight: 600;
  font-size: 0.9rem;
}
.user-trigger:hover,
.user-trigger[data-state='open'] { border-color: var(--c-primary); color: var(--c-primary); }
.user-trigger-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* Phones: avatar only, so the header doesn't wrap. */
@media (max-width: 540px) {
  .user-trigger { padding: 2px; }
  .user-trigger-name { display: none; }
}

.user-menu { min-width: 200px; }
.user-name { font-weight: 600; overflow-wrap: anywhere; }
.user-menu .danger { color: var(--c-danger); }
.user-menu .danger[data-highlighted] { background: var(--c-danger-soft); }
</style>
