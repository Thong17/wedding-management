<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import { useAuthStore } from '@/stores/auth'
import { confirmDialog } from '@/utils/confirmDialog'
import { useSyncStore } from '@/stores/sync'

/**
 * Shown instead of the app while the login is locked. Gifts already saved on this device keep
 * uploading (the server always accepts them), and the Sync center stays reachable, so nothing is lost.
 */
const auth = useAuthStore()
const sync = useSyncStore()
const router = useRouter()
const { t } = useI18n()

const waiting = computed(() => sync.unsynced)
const failed = computed(() => sync.counts.failed)
const checking = ref(false)
const whom = computed(() => (auth.isClientAdmin || !auth.user?.client ? t('lockScreen.contactUs') : t('lockScreen.contactClient', { name: auth.user.client.business_name })))

async function checkAgain() {
  checking.value = true
  try {
    await auth.refresh() // unlocks as soon as the server says so
  } finally {
    checking.value = false
  }
}

// Check now and then, so extending the trial or activating the client unlocks without any action here.
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  void checkAgain()
  timer = setInterval(() => {
    if (document.visibilityState === 'visible') void checkAgain()
  }, 60_000)
})
onBeforeUnmount(() => clearInterval(timer))

async function logout() {
  const unsynced = waiting.value + failed.value
  if (unsynced > 0 && !(await confirmDialog({ message: t('app.logoutConfirm', unsynced), confirmText: t('app.logout') }))) return
  auth.logout()
  router.push({ name: 'login' })
}
</script>

<template>
  <div class="container lock">
    <div class="card stack">
      <div class="icon"><AppIcon name="shield" :size="32" /></div>
      <h1>{{ auth.lockReason === 'suspended' ? t('lockScreen.suspendedTitle') : t('lockScreen.trialTitle') }}</h1>
      <p>{{ auth.lockReason === 'suspended' ? t('lockScreen.suspendedBody') : t('lockScreen.trialBody') }} {{ whom }}</p>

      <div class="banner" :class="waiting || failed ? 'banner-warn' : 'banner-info'">
        <template v-if="waiting">{{ t('lockScreen.uploading', waiting) }}</template>
        <template v-else-if="failed">{{ t('lockScreen.failed', failed) }}</template>
        <template v-else>{{ t('lockScreen.allUploaded') }}</template>
      </div>

      <div class="row">
        <button class="btn-primary" :disabled="checking" @click="checkAgain">{{ checking ? t('common.loading') : t('lockScreen.checkAgain') }}</button>
        <button v-if="waiting" :disabled="sync.state === 'syncing'" @click="sync.syncNow()">{{ t('lockScreen.uploadNow') }}</button>
        <RouterLink class="btn" to="/sync">{{ t('nav.sync') }}</RouterLink>
        <span class="spacer" />
        <button class="btn-small" @click="logout">{{ t('app.logout') }}</button>
      </div>
      <p class="muted small">{{ t('lockScreen.autoCheck') }}</p>
    </div>
  </div>
</template>

<style scoped>
.lock { max-width: 560px; padding-top: 8vh; }
.icon { width: 56px; height: 56px; display: grid; place-items: center; border-radius: 50%; corner-shape: round; background: var(--c-danger-soft); color: var(--c-danger); }
</style>
