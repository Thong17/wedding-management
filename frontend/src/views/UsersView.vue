<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import UserManager from '@/components/UserManager.vue'

/** Every login (platform admin). */
const { t } = useI18n()
</script>

<template>
  <div class="container stack">
    <h1>{{ t('users.title') }}</h1>
    <p class="muted small">{{ t('users.helpAdmin') }}</p>
    <div class="card stack">
      <UserManager />
    </div>
  </div>
</template>
