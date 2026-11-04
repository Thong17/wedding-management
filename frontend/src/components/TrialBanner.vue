<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'

/** "Trial ends in N days" during the last week of access. Can be hidden for the rest of the day. */
const WARN_DAYS = 7
const KEY = 'wms.trialBannerHidden'

const auth = useAuthStore()
const { t } = useI18n()
const today = new Date().toISOString().slice(0, 10)

function hiddenToday(): boolean {
  try {
    return localStorage.getItem(KEY) === today
  } catch {
    return false
  }
}
const hidden = ref(hiddenToday())
function hide() {
  hidden.value = true
  try {
    localStorage.setItem(KEY, today)
  } catch {
    /* storage unavailable */
  }
}

const days = computed(() => auth.daysLeft)
const show = computed(() => !hidden.value && days.value != null && days.value >= 0 && days.value <= WARN_DAYS)
const message = computed(() => {
  const d = days.value ?? 0
  const when = d === 0 ? t('trial.today') : d === 1 ? t('trial.tomorrow') : t('trial.inDays', { n: d, date: auth.user?.access_ends_at })
  const action = auth.isClientAdmin || !auth.user?.client ? t('trial.contactUs') : t('trial.contactClient', { name: auth.user.client.business_name })
  return `${when} ${action}`
})
</script>

<template>
  <div v-if="show" class="container no-print">
    <div class="banner banner-warn row" role="status">
      <span>{{ message }}</span>
      <span class="spacer" />
      <button type="button" class="btn-small" @click="hide">{{ t('trial.hide') }}</button>
    </div>
  </div>
</template>
