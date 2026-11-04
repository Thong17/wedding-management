<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { clientsApi } from '@/api/endpoints'
import { errorMessage } from '@/api/http'
import type { ApiClient } from '@/api/types'
import AppDialog from '@/components/AppDialog.vue'
import AppIcon from '@/components/AppIcon.vue'
import ClientForm from '@/components/ClientForm.vue'
import AppSelect from '@/components/AppSelect.vue'
import { clientStatusBadge } from '@/utils/clientStatus'
import { formatMoney } from '@/utils/format'

const { t } = useI18n()
const router = useRouter()
const creating = ref(false)
const clients = ref<ApiClient[]>([])
const error = ref<string | null>(null)
const loading = ref(true)
const filters = reactive({ status: 'all', search: '' })
const statusOptions = () => [
  { value: 'all', label: t('clients.allStatuses') },
  { value: 'trial', label: t('clients.status.trial') },
  { value: 'active', label: t('clients.status.active') },
  { value: 'suspended', label: t('clients.status.suspended') },
]

async function load() {
  loading.value = true
  error.value = null
  try {
    clients.value = await clientsApi.list({
      status: filters.status === 'all' ? undefined : filters.status,
      search: filters.search.trim() || undefined,
    })
  } catch (err) {
    error.value = errorMessage(err)
  } finally {
    loading.value = false
  }
}
let timer: ReturnType<typeof setTimeout> | undefined
watch(() => filters.status, load)
watch(() => filters.search, () => {
  clearTimeout(timer)
  timer = setTimeout(load, 300)
})
onMounted(load)

const price = (c: ApiClient) =>
  c.subscription_price ? `${formatMoney(c.subscription_price, c.subscription_currency)}${c.billing_period ? ` / ${t(`clients.period.${c.billing_period}`)}` : ''}` : '—'
</script>

<template>
  <div class="container stack">
    <div class="row">
      <h1>{{ t('clients.title') }}</h1>
      <span class="spacer" />
      <button class="btn-primary" @click="creating = true"><AppIcon name="plus" />{{ t('clients.new') }}</button>
    </div>
    <AppDialog v-model:open="creating" :title="t('clients.new')" size="lg">
      <ClientForm v-if="creating" @saved="(c) => router.push(`/clients/${c.id}`)" @cancel="creating = false" />
    </AppDialog>
    <div class="row">
      <input v-model="filters.search" type="search" :placeholder="t('clients.search')" class="search" />
      <AppSelect v-model="filters.status" :options="statusOptions()" :aria-label="t('clients.statusLabel')" inline />
    </div>
    <div v-if="error" class="banner banner-danger">{{ error }}</div>
    <div class="card table-wrap">
      <table>
        <thead>
          <tr>
            <th>{{ t('clients.businessName') }}</th>
            <th>{{ t('clients.statusLabel') }}</th>
            <th>{{ t('clients.subscription') }}</th>
            <th>{{ t('clients.contact') }}</th>
            <th class="right">{{ t('clients.logins') }}</th>
            <th class="right">{{ t('clients.events') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in clients" :key="c.id">
            <td><RouterLink :to="`/clients/${c.id}`"><strong>{{ c.business_name }}</strong></RouterLink></td>
            <td><span class="badge" :class="clientStatusBadge(c).cls">{{ clientStatusBadge(c).label }}</span></td>
            <td class="small nowrap">{{ price(c) }}</td>
            <td class="small">{{ c.contact_name }}<div v-if="c.phone" class="muted">{{ c.phone }}</div></td>
            <td class="right small">{{ t('clients.loginCounts', { admins: c.admin_count, customers: c.customer_count }) }}</td>
            <td class="right">{{ c.event_count }}</td>
          </tr>
          <tr v-if="!clients.length && !loading"><td colspan="6" class="muted">{{ t('clients.empty') }}</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.search { flex: 1; min-width: 180px; }
</style>
