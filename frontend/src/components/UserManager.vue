<script setup lang="ts">
import axios from 'axios'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { clientsApi, usersApi } from '@/api/endpoints'
import { errorMessage } from '@/api/http'
import type { ApiManagedUser, ManagedUserInput } from '@/api/types'
import AppDatePicker from '@/components/AppDatePicker.vue'
import AppDialog from '@/components/AppDialog.vue'
import AppIcon from '@/components/AppIcon.vue'
import AppNote from '@/components/AppNote.vue'
import AppSelect from '@/components/AppSelect.vue'
import { useAuthStore } from '@/stores/auth'
import { confirmDialog } from '@/utils/confirmDialog'
import { formatDateTime } from '@/utils/format'
import { toast } from '@/utils/toast'

/**
 * Logins list + create / edit / deactivate / reset password.
 * - Platform admin: every login (or one client's, with `clientId`); sets type, client and a standalone
 *   customer's own access end date.
 * - Client admin: their client's logins; creates and manages customers only (the server enforces this).
 */
const props = defineProps<{ clientId?: number }>()
const auth = useAuthStore()
const { t } = useI18n()
const admin = computed(() => auth.isPlatformAdmin)

const users = ref<ApiManagedUser[]>([])
const clients = ref<{ id: number; business_name: string }[]>([])
const error = ref<string | null>(null)
const loading = ref(true)

const filters = reactive({ type: 'all', client: 'all', active: '1', search: '' })
const typeFilterOptions = computed(() => [
  { value: 'all', label: t('users.allTypes') },
  { value: 'client_admin', label: t('users.types.client_admin') },
  { value: 'customer', label: t('users.types.customer') },
])
const clientFilterOptions = computed(() => [
  { value: 'all', label: t('users.allClients') },
  { value: 'none', label: t('users.standalone') },
  ...clients.value.map((c) => ({ value: String(c.id), label: c.business_name })),
])
const activeOptions = computed(() => [
  { value: '1', label: t('users.activeOnly') },
  { value: '0', label: t('users.inactiveOnly') },
  { value: 'all', label: t('users.allStatuses') },
])

async function load() {
  loading.value = true
  error.value = null
  try {
    const client = props.clientId ?? (filters.client === 'all' ? undefined : filters.client === 'none' ? 'none' : Number(filters.client))
    users.value = await usersApi.list({
      type: filters.type === 'all' ? undefined : (filters.type as 'client_admin' | 'customer'),
      client,
      active: filters.active === 'all' ? undefined : (Number(filters.active) as 0 | 1),
      search: filters.search.trim() || undefined,
    })
  } catch (err) {
    error.value = errorMessage(err)
  } finally {
    loading.value = false
  }
}

let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(() => [filters.type, filters.client, filters.active], load)
watch(() => filters.search, () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(load, 300)
})
onMounted(async () => {
  if (admin.value && props.clientId == null) clients.value = await clientsApi.list().catch(() => [])
  await load()
})

/** A readable random starting password the admin can hand over (they can reset it later). */
function generatePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  return Array.from(bytes, (b) => chars[b % chars.length]).join('')
}

// --- Create / edit -------------------------------------------------------------------------------
const editing = ref<ApiManagedUser | 'new' | null>(null)
const form = reactive({ username: '', first_name: '', last_name: '', password: '', user_type: 'customer', client: 'none', trial_ends_at: '', is_active: true })
const fieldErrors = ref<Record<string, string[]>>({})
const saving = ref(false)
const formClientOptions = computed(() => [{ value: 'none', label: t('users.standalone') }, ...clients.value.map((c) => ({ value: String(c.id), label: c.business_name }))])
const formTypeOptions = computed(() => typeFilterOptions.value.slice(1))
// Only standalone customers have their own access end date; everyone else follows their client.
const showTrial = computed(() => admin.value && form.user_type === 'customer' && (props.clientId == null ? form.client === 'none' : false))

function startNew() {
  editing.value = 'new'
  fieldErrors.value = {}
  Object.assign(form, {
    username: '', first_name: '', last_name: '', password: generatePassword(), user_type: 'customer',
    client: props.clientId != null ? String(props.clientId) : 'none', trial_ends_at: '', is_active: true,
  })
}
function startEdit(u: ApiManagedUser) {
  editing.value = u
  fieldErrors.value = {}
  Object.assign(form, {
    username: u.username, first_name: u.first_name, last_name: u.last_name, password: '',
    user_type: u.user_type, client: u.client ? String(u.client) : 'none', trial_ends_at: u.trial_ends_at ?? '', is_active: u.is_active,
  })
}

function payload(): ManagedUserInput {
  const data: ManagedUserInput = { username: form.username.trim(), first_name: form.first_name, last_name: form.last_name, is_active: form.is_active }
  if (editing.value === 'new') data.password = form.password
  if (admin.value) {
    data.user_type = form.user_type as 'client_admin' | 'customer'
    data.client = props.clientId ?? (form.client === 'none' ? null : Number(form.client))
    if (data.client == null && data.user_type === 'customer') data.trial_ends_at = form.trial_ends_at || null
  }
  return data
}

async function save() {
  saving.value = true
  fieldErrors.value = {}
  try {
    if (editing.value === 'new') {
      const created = await usersApi.create(payload())
      toast(t('users.created', { name: created.username, password: form.password }), 'ok', 12_000)
    } else if (editing.value) {
      await usersApi.update(editing.value.id, payload())
      toast(t('users.saved'))
    }
    editing.value = null
    await load()
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 400) fieldErrors.value = err.response.data
    else toast(errorMessage(err), 'error')
  } finally {
    saving.value = false
  }
}

async function setActive(u: ApiManagedUser, active: boolean) {
  if (!active && !(await confirmDialog({ message: t('users.deactivateConfirm', { name: u.username }), confirmText: t('users.deactivate'), danger: true }))) return
  try {
    await usersApi.update(u.id, { is_active: active })
    await load()
  } catch (err) {
    toast(errorMessage(err), 'error')
  }
}

// --- Reset password ---
const resetting = ref<ApiManagedUser | null>(null)
const newPassword = ref('')
const resetErrors = ref<string[]>([])
function startReset(u: ApiManagedUser) {
  resetting.value = u
  newPassword.value = generatePassword()
  resetErrors.value = []
}
async function reset() {
  if (!resetting.value) return
  try {
    await usersApi.resetPassword(resetting.value.id, newPassword.value)
    toast(t('users.passwordReset', { name: resetting.value.username, password: newPassword.value }), 'ok', 12_000)
    resetting.value = null
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 400) resetErrors.value = err.response.data.password ?? [errorMessage(err)]
    else toast(errorMessage(err), 'error')
  }
}

/** Platform admins and (for client admins) other client admins are view-only here. */
const canEdit = (u: ApiManagedUser) => !u.is_platform_admin && u.id !== auth.user?.id && (admin.value || u.user_type === 'customer')
const typeLabel = (u: ApiManagedUser) => (u.is_platform_admin ? t('users.types.platform_admin') : t(`users.types.${u.user_type}`))
</script>

<template>
  <div class="stack">
    <div class="row">
      <input v-model="filters.search" type="search" :placeholder="t('users.search')" class="search" />
      <AppSelect v-if="admin" v-model="filters.type" :options="typeFilterOptions" :aria-label="t('users.type')" inline />
      <AppSelect v-if="admin && clientId == null" v-model="filters.client" :options="clientFilterOptions" :aria-label="t('users.client')" inline />
      <AppSelect v-model="filters.active" :options="activeOptions" :aria-label="t('users.status')" inline />
      <span class="spacer" />
      <button class="btn-primary" :disabled="editing === 'new'" @click="startNew"><AppIcon name="plus" />{{ admin ? t('users.new') : t('users.newCustomer') }}</button>
    </div>
    <div v-if="error" class="banner banner-danger small">{{ error }}</div>

    <AppDialog :open="editing !== null" :title="editing === 'new' ? (admin ? t('users.new') : t('users.newCustomer')) : editing ? t('users.edit', { name: editing.username }) : ''" @update:open="!$event && (editing = null)">
      <form v-if="editing" class="stack" @submit.prevent="save">
        <!-- At the top, so the Type / Client / Access ends fields below stay lined up. -->
        <AppNote v-if="showTrial">{{ t('users.accessEndsHint') }}</AppNote>
        <div class="row">
          <label class="grow">{{ t('users.username') }} <input v-model="form.username" required maxlength="150" autocapitalize="off" spellcheck="false" />
            <span v-if="fieldErrors.username" class="field-error">{{ fieldErrors.username.join(' ') }}</span></label>
          <label class="grow">{{ t('users.firstName') }} <input v-model="form.first_name" maxlength="150" /></label>
          <label class="grow">{{ t('users.lastName') }} <input v-model="form.last_name" maxlength="150" /></label>
        </div>
        <label v-if="editing === 'new'">{{ t('users.startPassword') }}
          <span class="row">
            <input v-model="form.password" required class="grow mono" autocomplete="new-password" spellcheck="false" />
            <button type="button" class="btn-small" @click="form.password = generatePassword()">{{ t('users.generate') }}</button>
          </span>
          <span class="muted small">{{ t('users.passwordHint') }}</span>
          <span v-if="fieldErrors.password" class="field-error">{{ fieldErrors.password.join(' ') }}</span>
        </label>
        <div v-if="admin" class="row">
          <label class="grow">{{ t('users.type') }} <AppSelect v-model="form.user_type" :options="formTypeOptions" /></label>
          <label v-if="clientId == null" class="grow">{{ t('users.client') }} <AppSelect v-model="form.client" :options="formClientOptions" />
            <span v-if="fieldErrors.client" class="field-error">{{ fieldErrors.client.join(' ') }}</span></label>
          <label v-if="showTrial" class="grow">{{ t('users.accessEnds') }} <AppDatePicker v-model="form.trial_ends_at" />
            <span v-if="fieldErrors.trial_ends_at" class="field-error">{{ fieldErrors.trial_ends_at.join(' ') }}</span></label>
        </div>
        <p v-if="!admin" class="muted small">{{ t('users.customerNote') }}</p>
        <div class="row">
          <button class="btn-primary" :disabled="saving">{{ saving ? t('giftForm.saving') : t('common.save') }}</button>
          <button type="button" @click="editing = null">{{ t('common.cancel') }}</button>
        </div>
      </form>
    </AppDialog>

    <AppDialog :open="resetting !== null" :title="resetting ? t('users.resetTitle', { name: resetting.username }) : ''" size="sm" @update:open="!$event && (resetting = null)">
      <form v-if="resetting" class="stack" @submit.prevent="reset">
        <span class="row">
          <input v-model="newPassword" required class="grow mono" autocomplete="new-password" spellcheck="false" :aria-label="t('users.newPassword')" />
          <button type="button" class="btn-small" @click="newPassword = generatePassword()">{{ t('users.generate') }}</button>
        </span>
        <span v-if="resetErrors.length" class="field-error">{{ resetErrors.join(' ') }}</span>
        <div class="row">
          <button class="btn-primary">{{ t('users.resetPassword') }}</button>
          <button type="button" @click="resetting = null">{{ t('common.cancel') }}</button>
        </div>
      </form>
    </AppDialog>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>{{ t('users.username') }}</th>
            <th>{{ t('users.type') }}</th>
            <th v-if="admin && clientId == null">{{ t('users.client') }}</th>
            <th>{{ t('users.status') }}</th>
            <th class="right">{{ t('users.events') }}</th>
            <th>{{ t('users.lastLogin') }}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="u in users" :key="u.id" :class="{ inactive: !u.is_active }">
            <td>
              <strong>{{ u.username }}</strong>
              <div v-if="u.first_name || u.last_name" class="muted small">{{ [u.first_name, u.last_name].filter(Boolean).join(' ') }}</div>
            </td>
            <td><span class="badge" :class="u.user_type === 'customer' ? 'badge-neutral' : 'badge-syncing'">{{ typeLabel(u) }}</span></td>
            <td v-if="admin && clientId == null" class="small">{{ u.client_name ?? t('users.standalone') }}</td>
            <td class="small">
              <span v-if="!u.is_active" class="badge badge-failed">{{ t('users.inactive') }}</span>
              <span v-else-if="u.lock_reason" class="badge badge-failed">{{ t(`lock.${u.lock_reason}`) }}</span>
              <span v-else class="badge badge-synced">{{ t('users.active') }}</span>
              <div v-if="u.trial_ends_at" class="muted">{{ t('users.until', { date: u.trial_ends_at }) }}</div>
            </td>
            <td class="right">{{ u.user_type === 'customer' ? u.assignment_count : '—' }}</td>
            <td class="small nowrap">{{ u.last_login ? formatDateTime(u.last_login) : t('users.never') }}</td>
            <td>
              <div v-if="canEdit(u)" class="row-actions">
                <button class="btn-small" @click="startEdit(u)">{{ t('common.edit') }}</button>
                <button class="btn-small" @click="startReset(u)">{{ t('users.resetPassword') }}</button>
                <button v-if="u.is_active" class="btn-small btn-danger" @click="setActive(u, false)">{{ t('users.deactivate') }}</button>
                <button v-else class="btn-small" @click="setActive(u, true)">{{ t('users.activate') }}</button>
              </div>
            </td>
          </tr>
          <tr v-if="!users.length && !loading"><td :colspan="admin && clientId == null ? 7 : 6" class="muted">{{ t('users.empty') }}</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.search { flex: 1; min-width: 180px; }
.grow { flex: 1; min-width: 160px; }
tr.inactive td { opacity: 0.6; }
</style>
