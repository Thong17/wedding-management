<script setup lang="ts">
import axios from 'axios'
import { reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { clientsApi } from '@/api/endpoints'
import { errorMessage } from '@/api/http'
import type { ApiClient, ClientInput } from '@/api/types'
import AppDatePicker from '@/components/AppDatePicker.vue'
import AppSelect from '@/components/AppSelect.vue'
import { toast } from '@/utils/toast'

/**
 * Create a client (no `client`) or edit one. `sections` limits the fields shown, e.g. only the
 * subscription when editing that tab. Emits the saved client.
 */
const props = withDefaults(defineProps<{ client?: ApiClient | null; sections?: ('business' | 'subscription')[] }>(), {
  client: null,
  sections: () => ['business', 'subscription'],
})
const emit = defineEmits<{ saved: [client: ApiClient]; cancel: [] }>()
const { t } = useI18n()

const c = props.client
const form = reactive<Required<ClientInput>>({
  business_name: c?.business_name ?? '', contact_name: c?.contact_name ?? '', phone: c?.phone ?? '', email: c?.email ?? '',
  address: c?.address ?? '', notes: c?.notes ?? '', status: c?.status ?? 'trial', trial_ends_at: c?.trial_ends_at ?? null,
  subscription_price: c?.subscription_price ?? null, subscription_currency: c?.subscription_currency ?? 'USD',
  billing_period: c?.billing_period ?? '', subscription_start: c?.subscription_start ?? null,
})
const fieldErrors = ref<Record<string, string[]>>({})
const saving = ref(false)
const show = (s: 'business' | 'subscription') => props.sections.includes(s)

async function save() {
  saving.value = true
  fieldErrors.value = {}
  // Blank inputs mean "no value" to the API; a blank trial date on a new client gets the default length.
  const data: ClientInput = {
    ...form,
    trial_ends_at: form.trial_ends_at || null,
    subscription_price: form.subscription_price === '' || form.subscription_price == null ? null : String(form.subscription_price),
    subscription_start: form.subscription_start || null,
  }
  try {
    const saved = props.client ? await clientsApi.update(props.client.id, data) : await clientsApi.create(data)
    toast(props.client ? t('clients.saved') : t('clients.created', { name: saved.business_name }))
    emit('saved', saved)
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 400) fieldErrors.value = err.response.data
    else toast(errorMessage(err), 'error')
  } finally {
    saving.value = false
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
  <form class="stack" @submit.prevent="save">
    <section v-if="show('business')" class="stack">
      <h3 v-if="sections.length > 1">{{ t('clients.tabs.business') }}</h3>
      <label>{{ t('clients.businessName') }} <input v-model="form.business_name" required maxlength="200" />
        <span v-if="errorsFor('business_name')" class="field-error">{{ errorsFor('business_name') }}</span></label>
      <div class="row">
        <label class="grow">{{ t('clients.contactName') }} <input v-model="form.contact_name" maxlength="200" /></label>
        <label class="grow">{{ t('clients.phone') }} <input v-model="form.phone" type="tel" maxlength="32" /></label>
      </div>
      <label>{{ t('clients.email') }} <input v-model="form.email" type="email" maxlength="254" />
        <span v-if="errorsFor('email')" class="field-error">{{ errorsFor('email') }}</span></label>
      <label>{{ t('clients.address') }} <textarea v-model="form.address" rows="2" /></label>
      <label>{{ t('clients.notes') }} <textarea v-model="form.notes" rows="2" /></label>
    </section>

    <section v-if="show('subscription')" class="stack">
      <h3 v-if="sections.length > 1">{{ t('clients.tabs.subscription') }}</h3>
      <div class="row">
        <label class="grow">{{ t('clients.statusLabel') }} <AppSelect v-model="form.status" :options="statusOptions()" /></label>
        <label v-if="form.status === 'trial'" class="grow">{{ t('clients.trialEnds') }}
          <AppDatePicker :model-value="form.trial_ends_at ?? ''" @update:model-value="form.trial_ends_at = $event || null" />
          <span class="muted small">{{ client ? t('clients.trialHint') : t('clients.trialDefault') }}</span></label>
      </div>
      <div class="row">
        <label class="grow">{{ t('clients.price') }} <input v-model="form.subscription_price" inputmode="decimal" placeholder="0.00" />
          <span v-if="errorsFor('subscription_price')" class="field-error">{{ errorsFor('subscription_price') }}</span></label>
        <label class="currency">{{ t('clients.currency') }} <input v-model="form.subscription_currency" maxlength="3" />
          <span v-if="errorsFor('subscription_currency')" class="field-error">{{ errorsFor('subscription_currency') }}</span></label>
      </div>
      <div class="row">
        <label class="grow">{{ t('clients.billingPeriod') }}
          <AppSelect :model-value="form.billing_period || 'none'" :options="periodOptions()" @update:model-value="form.billing_period = $event === 'none' ? '' : ($event as typeof form.billing_period)" /></label>
        <label class="grow">{{ t('clients.subscriptionStart') }}
          <AppDatePicker :model-value="form.subscription_start ?? ''" @update:model-value="form.subscription_start = $event || null" /></label>
      </div>
    </section>

    <div class="row">
      <button class="btn-primary" :disabled="saving">{{ saving ? t('giftForm.saving') : client ? t('common.save') : t('clients.create') }}</button>
      <button type="button" @click="emit('cancel')">{{ t('common.cancel') }}</button>
    </div>
  </form>
</template>

<style scoped>
.grow { flex: 1; min-width: 180px; }
.currency { width: 110px; }
textarea { resize: vertical; }
h3 { margin: 4px 0 0; }
</style>
