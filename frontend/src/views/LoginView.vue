<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { errorMessage } from '@/api/http'
import LanguageSwitch from '@/components/LanguageSwitch.vue'
import ThemeSwitch from '@/components/ThemeSwitch.vue'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()
const { t } = useI18n()
const username = ref(auth.user?.username ?? '')
const password = ref('')
const error = ref<string | null>(null)
const busy = ref(false)

async function submit() {
  busy.value = true
  error.value = null
  try {
    await auth.login(username.value.trim(), password.value)
    const next = typeof route.query.next === 'string' && route.query.next.startsWith('/') ? route.query.next : '/'
    router.replace(next)
  } catch (err) {
    error.value = errorMessage(err).includes('No active account') ? t('login.wrong') : errorMessage(err)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="container login">
    <form class="card stack" @submit.prevent="submit">
      <div class="row">
        <h1>💝 {{ t('login.title') }}</h1>
        <span class="spacer" />
        <ThemeSwitch />
        <LanguageSwitch />
      </div>
      <p class="muted small" v-if="auth.sessionExpired">{{ t('login.sessionExpired') }}</p>
      <label>{{ t('login.username') }} <input v-model="username" autocomplete="username" required autocapitalize="off" /></label>
      <label>{{ t('login.password') }} <input v-model="password" type="password" autocomplete="current-password" required /></label>
      <p v-if="error" class="field-error">{{ error }}</p>
      <button class="btn-primary" :disabled="busy">{{ busy ? t('login.signingIn') : t('login.signIn') }}</button>
      <p class="muted small">{{ t('login.onlineNote') }}</p>
    </form>
  </div>
</template>

<style scoped>
.login { max-width: 420px; padding-top: 10vh; }
</style>
