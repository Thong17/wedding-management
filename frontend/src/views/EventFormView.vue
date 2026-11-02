<script setup lang="ts">
import axios from 'axios'
import QRCode from 'qrcode'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { eventsApi } from '@/api/endpoints'
import { errorMessage } from '@/api/http'
import type { EventInput } from '@/api/types'
import AppDatePicker from '@/components/AppDatePicker.vue'
import { classifyInviteBase, guestQrPayload } from '@/offline/inviteQr'

// A made-up guest code, only for the preview QR below.
const SAMPLE_TOKEN = '00000000-0000-4000-8000-000000000000'

const props = defineProps<{ id?: string }>()
const router = useRouter()
const { t } = useI18n()
const form = reactive<EventInput>({ name: '', date: new Date().toISOString().slice(0, 10), venue: '', currency: 'USD', invite_qr: '' })
const fieldErrors = ref<Record<string, string[]>>({})
const error = ref<string | null>(null)
const busy = ref(false)

const invite = computed(() => classifyInviteBase(form.invite_qr))
const samplePayload = computed(() => (invite.value.kind === 'url' || invite.value.kind === 'khqr' ? guestQrPayload(SAMPLE_TOKEN, form.invite_qr) : null))
const sampleSvg = ref('')
watch(
  samplePayload,
  async (payload) => (sampleSvg.value = payload ? await QRCode.toString(payload, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }) : ''),
  { immediate: true },
)

onMounted(async () => {
  if (!props.id) return
  try {
    const e = await eventsApi.get(Number(props.id))
    Object.assign(form, { name: e.name, date: e.date, venue: e.venue, currency: e.currency, invite_qr: e.invite_qr })
  } catch (err) {
    error.value = errorMessage(err)
  }
})

async function save() {
  busy.value = true
  error.value = null
  fieldErrors.value = {}
  try {
    const saved = props.id ? await eventsApi.update(Number(props.id), form) : await eventsApi.create(form)
    router.push(`/events/${saved.id}`)
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 400) fieldErrors.value = err.response.data
    else error.value = errorMessage(err)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="container" style="max-width: 560px">
    <form class="card stack" @submit.prevent="save">
      <h1>{{ id ? t('eventForm.editTitle') : t('eventForm.newTitle') }}</h1>
      <label>{{ t('eventForm.name') }} <input v-model="form.name" required maxlength="200" />
        <span class="field-error" v-if="fieldErrors.name">{{ fieldErrors.name.join(' ') }}</span></label>
      <label>{{ t('eventForm.date') }} <AppDatePicker v-model="form.date" required />
        <span class="field-error" v-if="fieldErrors.date">{{ fieldErrors.date.join(' ') }}</span></label>
      <label>{{ t('eventForm.venue') }} <input v-model="form.venue" maxlength="255" /></label>
      <label>{{ t('eventForm.currency') }} <input v-model="form.currency" required maxlength="3" placeholder="USD" />
        <span class="field-error" v-if="fieldErrors.currency">{{ fieldErrors.currency.join(' ') }}</span></label>

      <label>{{ t('eventForm.inviteQr') }}
        <textarea v-model="form.invite_qr" rows="2" maxlength="1000" spellcheck="false" autocapitalize="off" :placeholder="t('eventForm.inviteQrPlaceholder')" />
        <span class="muted small">{{ t('eventForm.inviteQrHint') }}</span>
        <span class="field-error" v-if="fieldErrors.invite_qr">{{ fieldErrors.invite_qr.join(' ') }}</span>
      </label>
      <div v-if="invite.kind !== 'none'" class="invite-check">
        <p v-if="invite.kind === 'invalid'" class="field-error">
          {{ invite.reason === 'bad-khqr' ? t('eventForm.inviteBadKhqr') : t('eventForm.inviteNotLink') }}
        </p>
        <template v-else>
          <div class="row">
            <span class="badge badge-synced">
              {{ invite.kind === 'url' ? t('eventForm.inviteIsLink', { host: invite.url.hostname }) : t('eventForm.inviteIsKhqr', { name: invite.qr.merchantName || '—' }) }}
            </span>
            <a v-if="invite.kind === 'url'" class="small" :href="form.invite_qr.trim()" target="_blank" rel="noopener noreferrer">{{ t('eventForm.testLink') }}</a>
          </div>
          <div class="row sample">
            <div class="qr" v-html="sampleSvg" />
            <p class="muted small">{{ invite.kind === 'url' ? t('eventForm.sampleLink') : t('eventForm.sampleKhqr') }}</p>
          </div>
        </template>
      </div>

      <p v-if="error" class="banner banner-danger">{{ error }}</p>
      <div class="row">
        <button class="btn-primary" :disabled="busy">{{ t('common.save') }}</button>
        <button type="button" @click="router.back()">{{ t('common.cancel') }}</button>
      </div>
    </form>
  </div>
</template>

<style scoped>
textarea { resize: vertical; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 0.85rem; }
.invite-check { display: flex; flex-direction: column; gap: 10px; }
.sample { align-items: flex-start; flex-wrap: nowrap; gap: 12px; }
/* Always dark-on-white so phones can scan it in any theme. */
.qr { width: 140px; height: 140px; flex-shrink: 0; padding: 6px; background: #fff; border-radius: var(--radius-sm); }
.qr :deep(svg) { width: 100%; height: 100%; display: block; }
</style>
