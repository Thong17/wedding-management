<script setup lang="ts">
import axios from 'axios'
import { reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { authApi } from '@/api/endpoints'
import { errorMessage } from '@/api/http'
import { useSyncStore } from '@/stores/sync'
import { toast } from '@/utils/toast'

const { t } = useI18n()
const sync = useSyncStore()
const form = reactive({ current: '', next: '', confirm: '' })
const errors = ref<Record<string, string[]>>({})
const busy = ref(false)

async function submit() {
  errors.value = {}
  if (form.next !== form.confirm) {
    errors.value = { confirm: [t('password.mismatch')] }
    return
  }
  busy.value = true
  try {
    await authApi.changePassword(form.current, form.next)
    Object.assign(form, { current: '', next: '', confirm: '' })
    toast(t('password.changed'))
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 400) errors.value = err.response.data
    else toast(errorMessage(err), 'error')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <form class="card stack" @submit.prevent="submit">
    <h2>{{ t('password.title') }}</h2>
    <label>{{ t('password.current') }} <input v-model="form.current" type="password" required autocomplete="current-password" />
      <span v-if="errors.current_password" class="field-error">{{ errors.current_password.join(' ') }}</span></label>
    <label>{{ t('password.new') }} <input v-model="form.next" type="password" required autocomplete="new-password" />
      <span class="muted small">{{ t('password.hint') }}</span>
      <span v-if="errors.new_password" class="field-error">{{ errors.new_password.join(' ') }}</span></label>
    <label>{{ t('password.confirm') }} <input v-model="form.confirm" type="password" required autocomplete="new-password" />
      <span v-if="errors.confirm" class="field-error">{{ errors.confirm.join(' ') }}</span></label>
    <div class="row">
      <button class="btn-primary" :disabled="busy || !sync.browserOnline">{{ busy ? t('giftForm.saving') : t('password.change') }}</button>
    </div>
  </form>
</template>
