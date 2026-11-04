<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { clientsApi, eventsApi } from '@/api/endpoints'
import { errorMessage } from '@/api/http'
import type { ApiClient, ApiEvent, ClientInput } from '@/api/types'
import AppDialog from '@/components/AppDialog.vue'
import ClientDocuments from '@/components/ClientDocuments.vue'
import ClientForm from '@/components/ClientForm.vue'
import UserManager from '@/components/UserManager.vue'
import { confirmDialog } from '@/utils/confirmDialog'
import { clientStatusBadge } from '@/utils/clientStatus'
import { formatMoney } from '@/utils/format'
import { toast } from '@/utils/toast'

/** One client (platform admin). Details are read here; editing opens a dialog. */
const props = defineProps<{ id: string }>()
const router = useRouter()
const { t } = useI18n()
const clientId = Number(props.id)

const client = ref<ApiClient | null>(null)
const events = ref<ApiEvent[]>([])
const tab = ref<'business' | 'subscription' | 'documents' | 'logins' | 'events'>('business')
const error = ref<string | null>(null)
const editing = ref<'business' | 'subscription' | null>(null)
const saving = ref(false)

onMounted(async () => {
  try {
    client.value = await clientsApi.get(clientId)
    // The platform admin sees every event; keep this client's.
    events.value = (await eventsApi.list()).filter((e) => e.client === clientId)
  } catch (err) {
    error.value = errorMessage(err)
  }
})

function onSaved(c: ApiClient) {
  client.value = c
  editing.value = null
}

/** Quick status changes from the header. */
async function quick(change: ClientInput) {
  saving.value = true
  try {
    client.value = await clientsApi.update(clientId, change)
    toast(t('clients.saved'))
  } catch (err) {
    toast(errorMessage(err), 'error')
  } finally {
    saving.value = false
  }
}
function extendTrial() {
  const current = client.value?.trial_ends_at
  const base = current && Date.parse(current) > Date.now() ? new Date(current) : new Date()
  base.setDate(base.getDate() + 14)
  void quick({ status: 'trial', trial_ends_at: base.toISOString().slice(0, 10) })
}
async function suspend() {
  if (!client.value) return
  const message = t('clients.suspendConfirm', { name: client.value.business_name })
  if (await confirmDialog({ message, confirmText: t('clients.suspend'), danger: true })) void quick({ status: 'suspended' })
}

async function remove() {
  if (!client.value) return
  const message = t('clients.deleteConfirm', { name: client.value.business_name })
  if (!(await confirmDialog({ message, confirmText: t('clients.delete'), danger: true }))) return
  try {
    await clientsApi.remove(clientId)
    router.push('/clients')
  } catch (err) {
    toast(errorMessage(err), 'error')
  }
}

const dash = (v: string | null | undefined) => v || '—'
</script>

<template>
  <div class="container stack">
    <div v-if="error" class="banner banner-danger">{{ error }}</div>
    <template v-if="client">
      <div class="row">
        <h1>{{ client.business_name }}</h1>
        <span class="badge" :class="clientStatusBadge(client).cls">{{ clientStatusBadge(client).label }}</span>
        <span class="spacer" />
        <button v-if="client.status !== 'active'" class="btn-small" :disabled="saving" @click="quick({ status: 'active' })">{{ t('clients.activate') }}</button>
        <button v-if="client.status !== 'active'" class="btn-small" :disabled="saving" @click="extendTrial">{{ t('clients.extendTrial') }}</button>
        <button v-if="client.status !== 'suspended'" class="btn-small btn-danger" :disabled="saving" @click="suspend">{{ t('clients.suspend') }}</button>
      </div>

      <div class="tabs">
        <button :class="{ active: tab === 'business' }" @click="tab = 'business'">{{ t('clients.tabs.business') }}</button>
        <button :class="{ active: tab === 'subscription' }" @click="tab = 'subscription'">{{ t('clients.tabs.subscription') }}</button>
        <button :class="{ active: tab === 'documents' }" @click="tab = 'documents'">{{ t('clients.tabs.documents', { n: client.document_count }) }}</button>
        <button :class="{ active: tab === 'logins' }" @click="tab = 'logins'">{{ t('clients.tabs.logins') }}</button>
        <button :class="{ active: tab === 'events' }" @click="tab = 'events'">{{ t('clients.tabs.events', { n: events.length }) }}</button>
      </div>

      <section v-if="tab === 'business'" class="card stack">
        <dl class="fields">
          <dt>{{ t('clients.businessName') }}</dt><dd>{{ client.business_name }}</dd>
          <dt>{{ t('clients.contactName') }}</dt><dd>{{ dash(client.contact_name) }}</dd>
          <dt>{{ t('clients.phone') }}</dt><dd>{{ dash(client.phone) }}</dd>
          <dt>{{ t('clients.email') }}</dt><dd>{{ dash(client.email) }}</dd>
          <dt>{{ t('clients.address') }}</dt><dd class="pre">{{ dash(client.address) }}</dd>
          <dt>{{ t('clients.notes') }}</dt><dd class="pre">{{ dash(client.notes) }}</dd>
        </dl>
        <div><button class="btn-primary" @click="editing = 'business'">{{ t('common.edit') }}</button></div>
      </section>

      <section v-if="tab === 'subscription'" class="card stack">
        <dl class="fields">
          <dt>{{ t('clients.statusLabel') }}</dt>
          <dd><span class="badge" :class="clientStatusBadge(client).cls">{{ clientStatusBadge(client).label }}</span></dd>
          <dt>{{ t('clients.trialEnds') }}</dt><dd>{{ client.status === 'trial' ? dash(client.trial_ends_at) : '—' }}</dd>
          <dt>{{ t('clients.price') }}</dt>
          <dd>{{ client.subscription_price ? formatMoney(client.subscription_price, client.subscription_currency) : '—' }}</dd>
          <dt>{{ t('clients.billingPeriod') }}</dt><dd>{{ t(`clients.period.${client.billing_period || 'none'}`) }}</dd>
          <dt>{{ t('clients.subscriptionStart') }}</dt><dd>{{ dash(client.subscription_start) }}</dd>
        </dl>
        <div><button class="btn-primary" @click="editing = 'subscription'">{{ t('common.edit') }}</button></div>
      </section>

      <AppDialog :open="editing !== null" :title="editing === 'subscription' ? t('clients.editSubscription') : t('clients.editBusiness')" @update:open="!$event && (editing = null)">
        <ClientForm v-if="editing" :key="editing" :client="client" :sections="[editing]" @saved="onSaved" @cancel="editing = null" />
      </AppDialog>

      <div v-if="tab === 'documents'" class="card stack">
        <ClientDocuments :client-id="client.id" editable />
      </div>

      <div v-if="tab === 'logins'" class="card stack">
        <p class="muted small">{{ t('clients.loginsHelp') }}</p>
        <UserManager :client-id="client.id" />
        <RouterLink class="small" :to="{ path: '/roles', query: { client: client.id } }">{{ t('clients.viewRoles') }} →</RouterLink>
      </div>

      <div v-if="tab === 'events'" class="card stack">
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
    </template>
  </div>
</template>

<style scoped>
.fields { display: grid; grid-template-columns: minmax(140px, auto) 1fr; gap: 8px 16px; margin: 0; }
.fields dt { color: var(--c-muted); font-size: 0.9rem; }
.fields dd { margin: 0; overflow-wrap: anywhere; }
.pre { white-space: pre-line; }
.danger-zone { border-top: 1px solid var(--c-border); padding-top: 12px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
</style>
