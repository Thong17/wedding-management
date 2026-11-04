<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { clientsApi } from '@/api/endpoints'
import { errorMessage } from '@/api/http'
import type { ApiClient } from '@/api/types'
import ClientDocuments from '@/components/ClientDocuments.vue'
import { useAuthStore } from '@/stores/auth'
import { clientStatusBadge } from '@/utils/clientStatus'
import { formatMoney } from '@/utils/format'

/** A client admin's own business record: read-only (only the platform admin edits it). */
const auth = useAuthStore()
const { t } = useI18n()
const client = ref<ApiClient | null>(null)
const error = ref<string | null>(null)

onMounted(async () => {
  const id = auth.user?.client?.id
  if (!id) return
  try {
    client.value = await clientsApi.get(id)
  } catch (err) {
    error.value = errorMessage(err)
  }
})
</script>

<template>
  <div class="container stack">
    <h1>{{ t('business.title') }}</h1>
    <p class="muted small">{{ t('business.help') }}</p>
    <div v-if="error" class="banner banner-danger">{{ error }}</div>
    <template v-if="client">
      <div class="grid-2">
        <section class="card stack">
          <h2>{{ t('clients.tabs.business') }}</h2>
          <dl class="fields">
            <dt>{{ t('clients.businessName') }}</dt><dd>{{ client.business_name }}</dd>
            <dt>{{ t('clients.contactName') }}</dt><dd>{{ client.contact_name || '--' }}</dd>
            <dt>{{ t('clients.phone') }}</dt><dd>{{ client.phone || '--' }}</dd>
            <dt>{{ t('clients.email') }}</dt><dd>{{ client.email || '--' }}</dd>
            <dt>{{ t('clients.address') }}</dt><dd class="pre">{{ client.address || '--' }}</dd>
          </dl>
        </section>
        <section class="card stack">
          <h2>{{ t('clients.tabs.subscription') }}</h2>
          <dl class="fields">
            <dt>{{ t('clients.statusLabel') }}</dt>
            <dd><span class="badge" :class="clientStatusBadge(client).cls">{{ clientStatusBadge(client).label }}</span></dd>
            <dt>{{ t('clients.price') }}</dt>
            <dd>{{ client.subscription_price ? formatMoney(client.subscription_price, client.subscription_currency) : '--' }}</dd>
            <dt>{{ t('clients.billingPeriod') }}</dt><dd>{{ t(`clients.period.${client.billing_period || 'none'}`) }}</dd>
            <dt>{{ t('clients.subscriptionStart') }}</dt><dd>{{ client.subscription_start || '--' }}</dd>
          </dl>
        </section>
      </div>
      <section class="card stack">
        <h2>{{ t('clients.tabs.documents', { n: client.document_count }) }}</h2>
        <ClientDocuments :client-id="client.id" :editable="false" />
      </section>
    </template>
  </div>
</template>

<style scoped>
.fields { display: grid; grid-template-columns: minmax(120px, auto) 1fr; gap: 8px 16px; margin: 0; }
.fields dt { color: var(--c-muted); font-size: 0.9rem; }
.fields dd { margin: 0; overflow-wrap: anywhere; }
.pre { white-space: pre-line; }
</style>
