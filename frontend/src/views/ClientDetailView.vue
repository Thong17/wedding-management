<script setup lang="ts">
import axios from 'axios'
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { clientsApi, eventsApi } from '@/api/endpoints'
import { errorMessage } from '@/api/http'
import type { ApiClient, ApiEvent, ClientInput } from '@/api/types'
import AppDatePicker from '@/components/AppDatePicker.vue'
import AppSelect from '@/components/AppSelect.vue'
import ClientDocuments from '@/components/ClientDocuments.vue'
import UserManager from '@/components/UserManager.vue'
import { clientStatusBadge } from '@/utils/clientStatus'
import { toast } from '@/utils/toast'

/** One client (platform admin). Without `id` it creates a new client. */
const props = defineProps<{ id?: string }>()
const router = useRouter()
const { t } = useI18n()
const isNew = computed(() => !props.id)
const clientId = computed(() => Number(props.id))

const client = ref<ApiClient | null>(null)
const events = ref<ApiEvent[]>([])
const tab = ref<'business' | 'subscription' | 'documents' | 'logins' | 'events'>('business')
const error = ref<string | null>(null)
const saving = ref(false)
const fieldErrors = ref<Record<string, string[]>>({})

const empty = (): Required<ClientInput> => ({
  business_name: '', contact_name: '', phone: '', email: '', address: '', notes: '',
  status: 'trial', trial_ends_at: null, subscription_price: null, subscription_currency: 'USD',
  billing_period: '', subscription_start: null,
})
const form = reactive(empty())

function fill(c: ApiClient) {
  client.value = c
  for (const key of Object.keys(form) as (keyof ClientInput)[]) (form as Record<string, unknown>)[key] = c[key]
}

onMounted(async () => {
  if (isNew.value) return
  try {
    fill(await clientsApi.get(clientId.value))
    // The platform admin sees every event; keep this client's.
    events.value = (await eventsApi.list()).filter((e) => e.client === clientId.value)
  } catch (err) {
    error.value = errorMessage(err)
  }
})

function payload(): ClientInput {
  return {
    ...form,
    // Blank inputs mean "no value" to the API.
    trial_ends_at: form.status === 'trial' ? form.trial_ends_at || null : form.trial_ends_at,
    subscription_price: form.subscription_price === '' || form.subscription_price == null ? null : String(form.subscription_price),
    subscription_start: form.subscription_start || null,
  }
}

async function save(extra: ClientInput = {}) {
  saving.value = true
  fieldErrors.value = {}
  try {
    if (isNew.value) {
      const created = await clientsApi.create({ ...payload(), ...extra })
      toast(t('clients.created', { name: created.business_name }))
      router.replace(`/clients/${created.id}`)
      return
    }
    fill(await clientsApi.update(clientId.value, { ...payload(), ...extra }))
    toast(t('clients.saved'))
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 400) fieldErrors.value = err.response.data
    else toast(errorMessage(err), 'error')
  } finally {
    saving.value = false
  }
}

const addDays = (iso: string | null, days: number) => {
  const base = iso && Date.parse(iso) > Date.now() ? new Date(iso) : new Date()
  base.setDate(base.getDate() + days)
  return base.toISOString().slice(0, 10)
}
const extendTrial = () => save({ status: 'trial', trial_ends_at: addDays(form.trial_ends_at, 14) })
const activate = () => save({ status: 'active' })
function suspend() {
  if (confirm(t('clients.suspendConfirm', { name: form.business_name }))) void save({ status: 'suspended' })
}

async function remove() {
  if (!client.value || !confirm(t('clients.deleteConfirm', { name: client.value.business_name }))) return
  try {
    await clientsApi.remove(clientId.value)
    router.push('/clients')
  } catch (err) {
    toast(errorMessage(err), 'error')
  }
}

const statusOptions = () => (['trial', 'active', 'suspended'] as const).map((value) => ({ value, label: t(`clients.status.${value}`) }))
const periodOptions = () => [
  { value: 'none', label: t('clients.period.none') },
  ...(['monthly', 'yearly', 'per_event'] as const).map((value) => ({ value, label: t(`clients.period.${value}`) })),
]
const errorsFor = (key: string) => fieldErrors.value[key]?.join(' ')
</script>

<template>
  <div class="container stack">
    <div v-if="error" class="banner banner-danger">{{ error }}</div>
    <div class="row">
      <h1>{{ isNew ? t('clients.new') : form.business_name }}</h1>
      <span v-if="client" class="badge" :class="clientStatusBadge(client).cls">{{ clientStatusBadge(client).label }}</span>
      <span class="spacer" />
      <template v-if="client">
        <button v-if="client.status !== 'active'" class="btn-small" :disabled="saving" @click="activate">{{ t('clients.activate') }}</button>
        <button v-if="client.status !== 'active'" class="btn-small" :disabled="saving" @click="extendTrial">{{ t('clients.extendTrial') }}</button>
        <button v-if="client.status !== 'suspended'" class="btn-small btn-danger" :disabled="saving" @click="suspend">{{ t('clients.suspend') }}</button>
      </template>
    </div>

    <div v-if="!isNew" class="tabs">
      <button :class="{ active: tab === 'business' }" @click="tab = 'business'">{{ t('clients.tabs.business') }}</button>
      <button :class="{ active: tab === 'subscription' }" @click="tab = 'subscription'">{{ t('clients.tabs.subscription') }}</button>
      <button :class="{ active: tab === 'documents' }" @click="tab = 'documents'">{{ t('clients.tabs.documents', { n: client?.document_count ?? 0 }) }}</button>
      <button :class="{ active: tab === 'logins' }" @click="tab = 'logins'">{{ t('clients.tabs.logins') }}</button>
      <button :class="{ active: tab === 'events' }" @click="tab = 'events'">{{ t('clients.tabs.events', { n: events.length }) }}</button>
    </div>

    <form v-if="isNew || tab === 'business' || tab === 'subscription'" class="card stack form" @submit.prevent="save()">
      <section v-if="isNew || tab === 'business'" class="stack">
        <h2 v-if="isNew">{{ t('clients.tabs.business') }}</h2>
        <label>{{ t('clients.businessName') }} <input v-model="form.business_name" required maxlength="200" />
          <span v-if="errorsFor('business_name')" class="field-error">{{ errorsFor('business_name') }}</span></label>
        <div class="row">
          <label class="grow">{{ t('clients.contactName') }} <input v-model="form.contact_name" maxlength="200" /></label>
          <label class="grow">{{ t('clients.phone') }} <input v-model="form.phone" type="tel" maxlength="32" /></label>
          <label class="grow">{{ t('clients.email') }} <input v-model="form.email" type="email" maxlength="254" />
            <span v-if="errorsFor('email')" class="field-error">{{ errorsFor('email') }}</span></label>
        </div>
        <label>{{ t('clients.address') }} <textarea v-model="form.address" rows="2" /></label>
        <label>{{ t('clients.notes') }} <textarea v-model="form.notes" rows="2" /></label>
      </section>

      <section v-if="isNew || tab === 'subscription'" class="stack">
        <h2 v-if="isNew">{{ t('clients.tabs.subscription') }}</h2>
        <div class="row">
          <label class="grow">{{ t('clients.statusLabel') }} <AppSelect v-model="form.status" :options="statusOptions()" /></label>
          <label v-if="form.status === 'trial'" class="grow">{{ t('clients.trialEnds') }}
            <AppDatePicker :model-value="form.trial_ends_at ?? ''" @update:model-value="form.trial_ends_at = $event || null" />
            <span class="muted small">{{ isNew ? t('clients.trialDefault') : t('clients.trialHint') }}</span></label>
        </div>
        <div class="row">
          <label class="grow">{{ t('clients.price') }} <input v-model="form.subscription_price" inputmode="decimal" placeholder="0.00" />
            <span v-if="errorsFor('subscription_price')" class="field-error">{{ errorsFor('subscription_price') }}</span></label>
          <label class="currency">{{ t('clients.currency') }} <input v-model="form.subscription_currency" maxlength="3" />
            <span v-if="errorsFor('subscription_currency')" class="field-error">{{ errorsFor('subscription_currency') }}</span></label>
          <label class="grow">{{ t('clients.billingPeriod') }}
            <AppSelect :model-value="form.billing_period || 'none'" :options="periodOptions()" @update:model-value="form.billing_period = $event === 'none' ? '' : ($event as typeof form.billing_period)" /></label>
          <label class="grow">{{ t('clients.subscriptionStart') }}
            <AppDatePicker :model-value="form.subscription_start ?? ''" @update:model-value="form.subscription_start = $event || null" /></label>
        </div>
      </section>

      <div class="row">
        <button class="btn-primary" :disabled="saving">{{ saving ? t('giftForm.saving') : isNew ? t('clients.create') : t('common.save') }}</button>
        <RouterLink v-if="isNew" class="btn" to="/clients">{{ t('common.cancel') }}</RouterLink>
      </div>
    </form>

    <div v-if="client && tab === 'documents'" class="card stack">
      <ClientDocuments :client-id="client.id" editable />
    </div>

    <div v-if="client && tab === 'logins'" class="card stack">
      <p class="muted small">{{ t('clients.loginsHelp') }}</p>
      <UserManager :client-id="client.id" />
      <RouterLink class="small" :to="{ path: '/roles', query: { client: client.id } }">{{ t('clients.viewRoles') }} →</RouterLink>
    </div>

    <div v-if="client && tab === 'events'" class="card stack">
      <ul class="list">
        <li v-for="e in events" :key="e.id" class="row" style="padding: 8px 0">
          <RouterLink :to="`/events/${e.id}`"><strong>{{ e.name }}</strong></RouterLink>
          <span class="muted small">{{ e.date }}<span v-if="e.venue"> · {{ e.venue }}</span></span>
        </li>
        <li v-if="!events.length" class="muted small" style="padding: 8px 0">{{ t('clients.noEvents') }}</li>
      </ul>
      <div class="danger-zone">
        <button class="btn-small btn-danger" @click="remove">{{ t('clients.delete') }}</button>
        <span class="muted small">{{ t('clients.deleteHint') }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.form { max-width: 900px; }
.grow { flex: 1; min-width: 180px; }
.currency { width: 110px; }
textarea { resize: vertical; }
.danger-zone { border-top: 1px solid var(--c-border); padding-top: 12px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
</style>
