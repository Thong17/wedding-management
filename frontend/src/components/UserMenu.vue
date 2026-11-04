<script setup lang="ts">
import {
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuItemIndicator,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from 'reka-ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import AppAvatar from '@/components/AppAvatar.vue'
import AppIcon from '@/components/AppIcon.vue'
import { LOCALES, setLocale, type Locale } from '@/i18n'
import { setTheme, SWATCHES, theme, THEMES, type Theme } from '@/theme'
import { useAuthStore } from '@/stores/auth'
import { useSyncStore } from '@/stores/sync'
import { useInstallPrompt } from '@/utils/installPrompt'
import { toast } from '@/utils/toast'

const auth = useAuthStore()
const sync = useSyncStore()
const router = useRouter()
const { t, locale } = useI18n()
const installer = useInstallPrompt()

// Phones have no room for the language and theme buttons in the header: they live in this menu there.
const currentLocale = computed({
  get: () => locale.value as Locale,
  set: (l: Locale) => setLocale(l),
})
const currentTheme = computed({
  get: () => theme.value,
  set: (value: Theme) => setTheme(value),
})

async function installApp() {
  if (installer.canPrompt.value) {
    if (await installer.install()) toast(t('user.installed'))
  } else {
    alert(t('user.installIos'))
  }
}

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
        <DropdownMenuItem
          v-if="installer.canPrompt.value || installer.needsIosSteps.value"
          class="menu-item"
          @select="installApp"
        >
          <AppIcon name="download" :size="16" />{{ t('user.install') }}
        </DropdownMenuItem>
        <DropdownMenuGroup class="phone-only">
          <DropdownMenuSeparator class="menu-sep" />
          <DropdownMenuLabel class="menu-section"><AppIcon name="globe" :size="14" />{{ t('lang.label') }}</DropdownMenuLabel>
          <DropdownMenuRadioGroup v-model="currentLocale">
            <DropdownMenuRadioItem v-for="l in LOCALES" :key="l" :value="l" :lang="l" class="menu-item">
              {{ t(`lang.${l}`) }}
              <DropdownMenuItemIndicator class="indicator"><AppIcon name="check" :size="16" /></DropdownMenuItemIndicator>
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuLabel class="menu-section"><AppIcon name="palette" :size="14" />{{ t('theme.label') }}</DropdownMenuLabel>
          <DropdownMenuRadioGroup v-model="currentTheme">
            <DropdownMenuRadioItem v-for="name in THEMES" :key="name" :value="name" class="menu-item">
              <span class="theme-swatch" :style="{ background: SWATCHES[name].bg, '--accent': SWATCHES[name].accent }" aria-hidden="true" />
              {{ t(`theme.${name}`) }}
              <DropdownMenuItemIndicator class="indicator"><AppIcon name="check" :size="16" /></DropdownMenuItemIndicator>
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator class="menu-sep" />
        </DropdownMenuGroup>
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

.user-menu { min-width: 200px; max-height: calc(100dvh - var(--header-height, 72px) - 16px); overflow-y: auto; }
/* Language and theme: in the header on wide screens, in this menu on phones. */
.user-menu .phone-only { display: none; }
@media (max-width: 599px) {
  .user-menu .phone-only { display: block; }
}
.user-menu .menu-section {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px 2px;
  font-size: 0.78rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--c-muted);
}
.theme-swatch {
  position: relative;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  border-radius: 50%;
  corner-shape: round;
  border: 1px solid var(--c-border);
  overflow: hidden;
}
.theme-swatch::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, transparent 50%, var(--accent) 50%);
}
.user-name { font-weight: 600; overflow-wrap: anywhere; }
.user-menu .danger { color: var(--c-danger); }
.user-menu .danger[data-highlighted] { background: var(--c-danger-soft); }
</style>
