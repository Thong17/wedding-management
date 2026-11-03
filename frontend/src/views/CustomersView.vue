<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import UserManager from '@/components/UserManager.vue'

/** A client admin's customer logins (e.g. one per side of each wedding). */
const { t } = useI18n()
</script>

<template>
  <div class="container stack">
    <h1>{{ t('customers.title') }}</h1>
    <p class="muted small">{{ t('customers.help') }}</p>
    <div class="card stack">
      <UserManager />
    </div>
  </div>
</template>
