<script setup lang="ts">
import axios from 'axios'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { clientsApi, rolesApi } from '@/api/endpoints'
import { errorMessage } from '@/api/http'
import type { ApiRole } from '@/api/types'
import AppDialog from '@/components/AppDialog.vue'
import AppIcon from '@/components/AppIcon.vue'
import AppSelect from '@/components/AppSelect.vue'
import AppTooltip from '@/components/AppTooltip.vue'
import RoleForm, { type RoleFormValue } from '@/components/RoleForm.vue'
import { useAuthStore } from '@/stores/auth'
import { confirmDialog } from '@/utils/confirmDialog'
import { formatDateTime } from '@/utils/format'
import { toast } from '@/utils/toast'

const auth = useAuthStore()
const { t } = useI18n()

const roles = ref<ApiRole[]>([])
const clients = ref<{ id: number; business_name: string }[]>([])
const error = ref<string | null>(null)
const loading = ref(true)
// Platform admin only: which roles to show ('all', 'global' or a client id). A client page links here with ?client=<id>.
const route = useRoute()
const scope = ref(typeof route.query.client === 'string' ? route.query.client : 'all')

const clientOptions = computed(() => clients.value.map((c) => ({ value: String(c.id), label: c.business_name })))
const scopeOptions = computed(() => [{ value: 'all', label: t('roles.scopeAll') }, { value: 'global', label: t('roles.global') }, ...clientOptions.value])
const newRoleScopes = computed(() => [{ value: 'global', label: t('roles.global') }, ...clientOptions.value])
const shown = computed(() => {
  if (scope.value === 'all') return roles.value
  if (scope.value === 'global') return roles.value.filter((r) => r.client === null)
  return roles.value.filter((r) => r.client === null || String(r.client) === scope.value)
})

async function load() {
  loading.value = true
  error.value = null
  try {
    const [r, c] = await Promise.all([rolesApi.list(), auth.isPlatformAdmin ? clientsApi.list() : Promise.resolve([])])
    roles.value = r
    clients.value = c
  } catch (err) {
    error.value = errorMessage(err)
  } finally {
    loading.value = false
  }
}
onMounted(load)

// 'new', the id of the role being edited, or null. The form opens in a dialog.
const editing = ref<'new' | number | null>(null)
const editingRole = computed(() => (typeof editing.value === 'number' ? roles.value.find((r) => r.id === editing.value) ?? null : null))
const fieldErrors = ref<Record<string, string[]>>({})
const saving = ref(false)

function open(target: 'new' | number) {
  editing.value = target
  fieldErrors.value = {}
}
const newInitial = (): RoleFormValue => ({ name: '', permissions: ['gift_desk'], client: scope.value !== 'all' ? scope.value : 'global' })
const editInitial = (r: ApiRole): RoleFormValue => ({ name: r.name, permissions: r.permissions, client: r.client ? String(r.client) : 'global' })

async function save(value: RoleFormValue) {
  saving.value = true
  fieldErrors.value = {}
  try {
    if (editing.value === 'new') {
      // Client admins' roles always go to their own client (the server sets it).
      const client = auth.isPlatformAdmin ? (value.client === 'global' ? null : Number(value.client)) : undefined
      await rolesApi.create({ name: value.name, permissions: value.permissions, client })
    } else if (editing.value != null) {
      await rolesApi.update(editing.value, { name: value.name, permissions: value.permissions })
    }
    toast(t('roles.saved'))
    editing.value = null
    await load()
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 400) fieldErrors.value = err.response.data
    else toast(errorMessage(err), 'error')
  } finally {
    saving.value = false
  }
}

async function remove(role: ApiRole) {
  if (!(await confirmDialog({ message: t('roles.deleteConfirm', { name: role.name }), confirmText: t('common.delete'), danger: true }))) return
  try {
    await rolesApi.remove(role.id)
    toast(t('roles.deleted'), 'info')
    await load()
  } catch (err) {
    toast(errorMessage(err), 'error')
  }
}
</script>

<template>
  <div class="container stack">
    <div class="row">
      <h1>{{ t('roles.title') }}</h1>
      <span class="spacer" />
      <AppSelect v-if="auth.isPlatformAdmin" v-model="scope" :options="scopeOptions" :aria-label="t('roles.scope')" inline />
      <button class="btn-primary" :disabled="editing === 'new'" @click="open('new')"><AppIcon name="plus" />{{ t('roles.new') }}</button>
    </div>
    <p class="muted small">{{ auth.isPlatformAdmin ? t('roles.helpAdmin') : t('roles.helpClient') }}</p>
    <div v-if="error" class="banner banner-danger">{{ error }}</div>
    <p v-if="loading && !roles.length" class="muted">{{ t('common.loading') }}</p>

    <AppDialog :open="editing !== null" :title="editingRole ? t('roles.editTitle', { name: editingRole.name }) : t('roles.new')" @update:open="!$event && (editing = null)">
      <!-- Keyed so the form starts fresh for each role. -->
      <RoleForm
        :key="String(editing)"
        :initial="editingRole ? editInitial(editingRole) : newInitial()"
        :saving="saving"
        :errors="fieldErrors"
        :scope-options="!editingRole && auth.isPlatformAdmin ? newRoleScopes : undefined"
        :usage-count="editingRole?.usage_count"
        @save="save"
        @cancel="editing = null"
      />
    </AppDialog>

    <div class="roles">
      <div v-for="role in shown" :key="role.id" class="card stack">
        <div class="row">
          <h2 class="role-name">{{ role.name }}</h2>
          <span class="badge" :class="role.client ? 'badge-neutral' : 'badge-syncing'">{{ role.client_name ?? t('roles.global') }}</span>
          <span class="spacer" />
          <template v-if="role.editable">
            <button class="btn-small" @click="open(role.id)">{{ t('common.edit') }}</button>
            <!-- A disabled button gets no hover events: the tooltip sits on a wrapper. -->
            <AppTooltip :text="role.usage_count ? t('roles.inUse') : null">
              <span class="tooltip-wrap">
                <button class="btn-small btn-danger" :disabled="role.usage_count > 0" @click="remove(role)">{{ t('common.remove') }}</button>
              </span>
            </AppTooltip>
          </template>
        </div>
        <div class="chips">
          <span v-for="p in role.permissions" :key="p" class="badge badge-synced">{{ t(`perm.${p}`) }}</span>
          <span v-if="!role.permissions.length" class="muted small">{{ t('roles.noPermissions') }}</span>
        </div>
        <div class="muted small">
          {{ t('roles.usedBy', role.usage_count) }}
          <span v-if="role.updated_by_username"> · {{ t('roles.editedBy', { name: role.updated_by_username, when: formatDateTime(role.updated_at) }) }}</span>
        </div>
      </div>
    </div>
    <p v-if="!loading && !shown.length" class="muted">{{ t('roles.empty') }}</p>
  </div>
</template>

<style scoped>
.tooltip-wrap { display: inline-flex; }
.roles { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(min(360px, 100%), 1fr)); }
.role-name { margin: 0; overflow-wrap: anywhere; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
</style>
