<script setup lang="ts">
import axios from 'axios'
import { onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { documentsApi } from '@/api/endpoints'
import { errorMessage } from '@/api/http'
import type { ApiClientDocument, DocumentInput, DocumentType } from '@/api/types'
import AppDatePicker from '@/components/AppDatePicker.vue'
import AppDialog from '@/components/AppDialog.vue'
import AppIcon from '@/components/AppIcon.vue'
import AppSelect from '@/components/AppSelect.vue'
import { confirmDialog } from '@/utils/confirmDialog'
import { formatDateTime } from '@/utils/format'
import { toast } from '@/utils/toast'

/** A client's documents. `editable` (platform admin) can upload, edit and delete; others view and download. */
const props = defineProps<{ clientId: number; editable: boolean }>()
const { t } = useI18n()

const TYPES: DocumentType[] = ['business_license', 'id_card', 'contract', 'other']
const SOON_DAYS = 30

const docs = ref<ApiClientDocument[]>([])
const error = ref<string | null>(null)

async function load() {
  error.value = null
  try {
    docs.value = await documentsApi.list(props.clientId)
  } catch (err) {
    error.value = errorMessage(err)
  }
}
onMounted(load)

/** 'expired', 'soon' (within 30 days) or null. */
function expiry(doc: ApiClientDocument): 'expired' | 'soon' | null {
  if (!doc.expires_on) return null
  const days = (Date.parse(doc.expires_on) - Date.now()) / 86_400_000
  if (days < -1) return 'expired'
  return days <= SOON_DAYS ? 'soon' : null
}

const sizeLabel = (bytes: number | null) => (bytes == null ? '' : bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`)

async function download(doc: ApiClientDocument) {
  try {
    // Fetched with the login token and opened from memory: documents never have a public URL.
    const blob = await documentsApi.download(props.clientId, doc.id)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = doc.original_name || 'document'
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  } catch (err) {
    toast(errorMessage(err), 'error')
  }
}

// --- Upload / edit (platform admin) ---
const editingId = ref<number | 'new' | null>(null)
const form = reactive<DocumentInput>({ doc_type: 'business_license', number: '', issued_on: null, expires_on: null, notes: '' })
const file = ref<File | null>(null)
const fieldErrors = ref<Record<string, string[]>>({})
const saving = ref(false)

function startNew() {
  editingId.value = 'new'
  Object.assign(form, { doc_type: 'business_license', number: '', issued_on: null, expires_on: null, notes: '' })
  file.value = null
  fieldErrors.value = {}
}
function startEdit(doc: ApiClientDocument) {
  editingId.value = doc.id
  Object.assign(form, { doc_type: doc.doc_type, number: doc.number, issued_on: doc.issued_on, expires_on: doc.expires_on, notes: doc.notes })
  file.value = null
  fieldErrors.value = {}
}
function onFile(e: Event) {
  file.value = (e.target as HTMLInputElement).files?.[0] ?? null
}

async function save() {
  saving.value = true
  fieldErrors.value = {}
  // The date picker uses '' for "no date"; the API wants null.
  const data: DocumentInput = { ...form, issued_on: form.issued_on || null, expires_on: form.expires_on || null }
  if (file.value) data.file = file.value
  try {
    if (editingId.value === 'new') await documentsApi.create(props.clientId, data)
    else if (editingId.value != null) await documentsApi.update(props.clientId, editingId.value, data)
    toast(t('documents.saved'))
    editingId.value = null
    await load()
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 400) fieldErrors.value = err.response.data
    else toast(errorMessage(err), 'error')
  } finally {
    saving.value = false
  }
}

async function remove(doc: ApiClientDocument) {
  if (!(await confirmDialog({ message: t('documents.deleteConfirm', { name: doc.original_name }), confirmText: t('common.delete'), danger: true }))) return
  try {
    await documentsApi.remove(props.clientId, doc.id)
    await load()
  } catch (err) {
    toast(errorMessage(err), 'error')
  }
}

const typeOptions = () => TYPES.map((value) => ({ value, label: t(`documents.types.${value}`) }))
</script>

<template>
  <div class="stack">
    <div class="row">
      <p class="muted small grow">{{ t('documents.privacy') }}</p>
      <button v-if="editable" class="btn-small btn-primary" @click="startNew"><AppIcon name="plus" :size="16" />{{ t('documents.upload') }}</button>
    </div>
    <div v-if="error" class="banner banner-danger small">{{ error }}</div>

    <AppDialog v-if="editable" :open="editingId !== null" :title="editingId === 'new' ? t('documents.upload') : t('documents.edit')" @update:open="!$event && (editingId = null)">
      <form class="stack" @submit.prevent="save">
        <div class="row">
          <label class="grow">{{ t('documents.type') }} <AppSelect v-model="form.doc_type" :options="typeOptions()" /></label>
          <label class="grow">{{ t('documents.number') }} <input v-model="form.number" maxlength="100" /></label>
        </div>
        <div class="row">
          <label class="grow">{{ t('documents.issuedOn') }} <AppDatePicker :model-value="form.issued_on ?? ''" @update:model-value="form.issued_on = $event || null" /></label>
          <label class="grow">{{ t('documents.expiresOn') }} <AppDatePicker :model-value="form.expires_on ?? ''" @update:model-value="form.expires_on = $event || null" />
            <span v-if="fieldErrors.expires_on" class="field-error">{{ fieldErrors.expires_on.join(' ') }}</span></label>
        </div>
        <label>{{ t('documents.notes') }} <textarea v-model="form.notes" rows="2" /></label>
        <label>{{ editingId === 'new' ? t('documents.file') : t('documents.replaceFile') }}
          <input type="file" accept=".pdf,image/jpeg,image/png,image/webp" @change="onFile" />
          <span class="muted small">{{ t('documents.fileHint') }}</span>
          <span v-if="fieldErrors.file" class="field-error">{{ fieldErrors.file.join(' ') }}</span></label>
        <div class="row">
          <button class="btn-primary" :disabled="saving || (editingId === 'new' && !file)">{{ saving ? t('giftForm.saving') : t('common.save') }}</button>
          <button type="button" @click="editingId = null">{{ t('common.cancel') }}</button>
        </div>
      </form>
    </AppDialog>

    <ul class="list">
      <li v-for="doc in docs" :key="doc.id" class="doc">
        <div class="row">
          <AppIcon name="file" />
          <strong>{{ t(`documents.types.${doc.doc_type}`) }}</strong>
          <span v-if="doc.number" class="muted small mono">{{ doc.number }}</span>
          <span v-if="expiry(doc) === 'expired'" class="badge badge-failed">{{ t('documents.expired') }}</span>
          <span v-else-if="expiry(doc) === 'soon'" class="badge badge-pending">{{ t('documents.expiresSoon') }}</span>
          <span class="spacer" />
          <div class="row-actions">
            <button class="btn-small" @click="download(doc)">{{ t('documents.download') }}</button>
            <template v-if="editable">
              <button class="btn-small" @click="startEdit(doc)">{{ t('common.edit') }}</button>
              <button class="btn-small btn-danger" :aria-label="t('common.remove')" @click="remove(doc)">✕</button>
            </template>
          </div>
        </div>
        <div class="muted small">
          {{ doc.original_name }} · {{ sizeLabel(doc.size) }}
          <span v-if="doc.issued_on"> · {{ t('documents.issued', { date: doc.issued_on }) }}</span>
          <span v-if="doc.expires_on"> · {{ t('documents.expires', { date: doc.expires_on }) }}</span>
          · {{ t('documents.uploaded', { when: formatDateTime(doc.uploaded_at), name: doc.uploaded_by_username ?? '--' }) }}
        </div>
        <div v-if="doc.notes" class="small">{{ doc.notes }}</div>
      </li>
      <li v-if="!docs.length && !error" class="muted small doc">{{ t('documents.empty') }}</li>
    </ul>
  </div>
</template>

<style scoped>
.grow { flex: 1; min-width: 160px; }
.doc { padding: 10px 0; display: flex; flex-direction: column; gap: 4px; }
textarea { resize: vertical; }
</style>
