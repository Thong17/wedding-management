<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { errorMessage } from '@/api/http'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()
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
    error.value = errorMessage(err).includes('No active account') ? 'Wrong username or password.' : errorMessage(err)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="container login">
    <form class="card stack" @submit.prevent="submit">
      <h1>💝 Wedding Gift Desk</h1>
      <p class="muted small" v-if="auth.sessionExpired">
        Your session expired. Log in again to resume uploading. Gifts already saved on this device are kept.
      </p>
      <label>Username <input v-model="username" autocomplete="username" required autocapitalize="off" /></label>
      <label>Password <input v-model="password" type="password" autocomplete="current-password" required /></label>
      <p v-if="error" class="field-error">{{ error }}</p>
      <button class="btn-primary" :disabled="busy">{{ busy ? 'Signing in…' : 'Sign in' }}</button>
      <p class="muted small">You must be online to sign in. After that, the gift desk works offline.</p>
    </form>
  </div>
</template>

<style scoped>
.login { max-width: 420px; padding-top: 10vh; }
</style>
