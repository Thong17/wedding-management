<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { intlLocale } from '@/i18n'
import type { CachedGuest, GiftMethod } from '@/offline/db'
import { GiftValidationError, validateGiftInput, type GiftInput, type ValidationErrors } from '@/offline/transactionRepo'
import { sideLabel } from '@/utils/format'

const props = defineProps<{
  guest: CachedGuest | null
  currency: string
  eventId: number
  /** Gifts already recorded on this device for the selected guest. */
  previousCount: number
  submit: (input: Omit<GiftInput, 'eventId'>) => Promise<unknown>
}>()
const emit = defineEmits<{ clearGuest: [] }>()
const { t } = useI18n()

const amount = ref('')
const method = ref<GiftMethod>('cash')
const note = ref('')
const item = ref('')
const isItem = computed(() => method.value === 'item')
const walkInName = ref('')
const errors = ref<ValidationErrors>({})
const saving = ref(false)
const formError = ref<string | null>(null)
const amountInput = ref<HTMLInputElement | null>(null)
const itemInput = ref<HTMLInputElement | null>(null)
const METHODS = ['cash', 'transfer', 'item', 'other'] as const

// Switching to Item moves the cursor to the description, and back to money to the amount.
watch(isItem, async (on) => {
  delete errors.value.amount
  delete errors.value.item
  await nextTick()
  ;(on ? itemInput : amountInput).value?.focus()
})

const quickAmounts = computed(() => (props.currency === 'KHR' ? [20000, 40000, 50000, 100000] : [10, 20, 50, 100]))

watch(
  () => props.guest?.id,
  async (id) => {
    errors.value = {}
    if (id != null) {
      walkInName.value = ''
      await nextTick()
      ;(isItem.value ? itemInput : amountInput).value?.focus()
    }
  },
)

function buildInput(): Omit<GiftInput, 'eventId'> {
  return {
    guestId: props.guest?.id ?? null,
    guestName: props.guest?.full_name ?? walkInName.value.trim(),
    walkInName: props.guest ? '' : walkInName.value,
    amount: amount.value,
    currency: props.currency,
    method: method.value,
    item: item.value,
    note: note.value,
  }
}

async function onSubmit() {
  const input = buildInput()
  errors.value = validateGiftInput({ ...input, eventId: props.eventId })
  if (Object.keys(errors.value).length) return
  if (props.previousCount > 0 && !confirm(t('giftForm.confirmAnother', { name: input.guestName, n: props.previousCount }))) return
  saving.value = true
  formError.value = null
  try {
    await props.submit(input)
    amount.value = ''
    item.value = ''
    note.value = ''
    walkInName.value = ''
    method.value = 'cash'
  } catch (err) {
    if (err instanceof GiftValidationError) errors.value = err.errors
    // Not saved: keep the form filled in so nothing typed is lost.
    else formError.value = t('giftForm.saveFailed', { error: err instanceof Error ? err.message : String(err) })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <form class="stack" @submit.prevent="onSubmit">
    <div v-if="guest" class="selected">
      <div class="row">
        <div>
          <strong class="name">{{ guest.full_name }}</strong>
          <div class="muted small">
            {{ sideLabel(guest.side) }}<span v-if="guest.group"> · {{ guest.group }}</span><span v-if="guest.table_no"> · {{ t('common.table', { n: guest.table_no }) }}</span>
          </div>
        </div>
        <span class="spacer" />
        <button type="button" class="btn-small" @click="emit('clearGuest')">{{ t('common.change') }}</button>
      </div>
      <p v-if="previousCount" class="banner banner-warn small">{{ t('giftForm.already', { n: previousCount }) }}</p>
    </div>
    <label v-else>
      {{ t('giftForm.walkIn') }}
      <input v-model="walkInName" maxlength="200" :placeholder="t('giftForm.walkInPlaceholder')" />
      <span class="field-error" v-if="errors.guest">{{ errors.guest }}</span>
    </label>

    <div class="row methods" role="radiogroup" :aria-label="t('giftForm.methodLabel')">
      <label v-for="m in METHODS" :key="m" class="method" :class="{ on: method === m }">
        <input type="radio" :value="m" v-model="method" hidden />
        {{ t(`giftForm.${m}`) }}
      </label>
    </div>

    <label v-if="isItem">
      {{ t('giftForm.itemLabel') }}
      <input ref="itemInput" v-model="item" maxlength="200" :placeholder="t('giftForm.itemPlaceholder')" class="amount" autocomplete="off" />
      <span class="muted small">{{ t('giftForm.itemHint') }}</span>
      <span class="field-error" v-if="errors.item">{{ errors.item }}</span>
    </label>
    <template v-else>
      <label>
        {{ t('giftForm.amount', { currency }) }}
        <input ref="amountInput" v-model="amount" inputmode="decimal" placeholder="0.00" class="amount" autocomplete="off" />
        <span class="field-error" v-if="errors.amount">{{ errors.amount }}</span>
      </label>
      <div class="row">
        <button v-for="q in quickAmounts" :key="q" type="button" class="btn-small" @click="amount = String(q)">{{ q.toLocaleString(intlLocale()) }}</button>
      </div>
    </template>

    <label>{{ t('giftForm.note') }} <input v-model="note" maxlength="500" :placeholder="t('giftForm.notePlaceholder')" /></label>
    <span class="field-error" v-if="errors.note">{{ errors.note }}</span>

    <p v-if="formError" class="banner banner-danger small">{{ formError }}</p>
    <button class="btn-primary btn-block big" :disabled="saving">{{ saving ? t('giftForm.saving') : t('giftForm.record') }}</button>
  </form>
</template>

<style scoped>
.selected { padding: 12px; border-radius: var(--radius-md); background: var(--c-primary-soft); }
.name { font-size: 1.15rem; }
.amount { font-size: 1.6rem; font-weight: 700; }
.methods { gap: 6px; }
.method {
  flex: 1;
  flex-direction: row;
  justify-content: center;
  padding: 10px;
  border: 1px solid var(--c-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  min-width: 90px;
}
.method.on { border-color: var(--c-primary); background: var(--c-primary-soft); color: var(--c-primary); }
.big { min-height: 52px; font-size: 1.05rem; }
</style>
