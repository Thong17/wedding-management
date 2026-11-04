<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { assignmentsApi, rolesApi, usersApi } from '@/api/endpoints'
import { errorMessage } from '@/api/http'
import type { ApiAssignment, ApiEvent, ApiManagedUser, ApiRole } from '@/api/types'
import AppDialog from '@/components/AppDialog.vue'
import AppIcon from '@/components/AppIcon.vue'
import AppSelect from '@/components/AppSelect.vue'
import { toast } from '@/utils/toast'

/** The people on an event (customers with a role). Only shown to people with full access. */
const props = defineProps<{ event: ApiEvent }>()
const emit = defineEmits<{ count: [n: number] }>()
const { t } = useI18n()

const assignments = ref<ApiAssignment[]>([])
const roles = ref<ApiRole[]>([])
const customers = ref<ApiManagedUser[]>([])
const error = ref<string | null>(null)
const newUser = ref<string>('')
const newRole = ref<string>('')
const busy = ref(false)
const assigning = ref(false)

const roleOptions = computed(() =>
  roles.value.map((r) => ({ value: String(r.id), label: r.client ? r.name : `${r.name} · ${t('team.global')}` })),
)
const assignedIds = computed(() => new Set(assignments.value.map((a) => a.user_id)))
// The server decides who may be assigned (a client admin only sees their own client's customers).
const customerOptions = computed(() =>
  customers.value
    .filter((c) => !assignedIds.value.has(c.id))
    .map((c) => ({ value: String(c.id), label: c.client_name && c.client !== props.event.client ? `${c.username} · ${c.client_name}` : c.username })),
)

async function load() {
  error.value = null
  try {
    const [a, r, c] = await Promise.all([
      assignmentsApi.list(props.event.id),
      // Roles usable on this event: global ones plus the event's client's own.
      rolesApi.list(props.event.client ?? 'global'),
      usersApi.list({ type: 'customer', active: 1 }),
    ])
    assignments.value = a
    roles.value = r
    customers.value = c
    newRole.value ||= String(r.find((x) => !x.client && x.name === 'Default')?.id ?? r[0]?.id ?? '')
    emit('count', a.length)
  } catch (err) {
    error.value = errorMessage(err)
  }
}
onMounted(load)

async function add() {
  if (!newUser.value || !newRole.value) return
  busy.value = true
  try {
    await assignmentsApi.add(props.event.id, Number(newUser.value), Number(newRole.value))
    newUser.value = ''
    assigning.value = false
    await load()
  } catch (err) {
    toast(errorMessage(err), 'error')
  } finally {
    busy.value = false
  }
}

async function changeRole(a: ApiAssignment, roleId: string) {
  try {
    const updated = await assignmentsApi.setRole(props.event.id, a.id, Number(roleId))
    Object.assign(a, updated)
    toast(t('team.roleChanged', { name: a.username, role: updated.role_name }), 'info')
  } catch (err) {
    toast(errorMessage(err), 'error')
  }
}

async function remove(a: ApiAssignment) {
  if (!confirm(t('team.removeConfirm', { name: a.username }))) return
  try {
    await assignmentsApi.remove(props.event.id, a.id)
    await load()
  } catch (err) {
    toast(errorMessage(err), 'error')
  }
}
</script>

<template>
  <div class="stack">
    <p class="muted small">{{ t('team.help') }}</p>
    <div v-if="error" class="banner banner-danger small">{{ error }}</div>

    <ul class="list">
      <li v-for="a in assignments" :key="a.id" class="row team-row">
        <strong class="name">{{ a.username }}</strong>
        <span class="spacer" />
        <AppSelect :model-value="String(a.role_id)" :options="roleOptions" :aria-label="t('team.roleFor', { name: a.username })" inline @update:model-value="changeRole(a, $event)" />
        <button class="btn-small btn-danger" @click="remove(a)">{{ t('common.remove') }}</button>
      </li>
      <li v-if="!assignments.length && !error" class="muted small team-row">{{ t('team.empty') }}</li>
    </ul>

    <div class="row">
      <button class="btn-primary" @click="assigning = true"><AppIcon name="plus" />{{ t('team.assignTitle') }}</button>
    </div>

    <AppDialog v-model:open="assigning" :title="t('team.assignTitle')" size="sm">
      <form class="stack" @submit.prevent="add">
        <label>{{ t('team.customer') }}
          <AppSelect v-model="newUser" :options="customerOptions" :placeholder="customerOptions.length ? t('team.pickCustomer') : t('team.noCustomers')" /></label>
        <label>{{ t('team.role') }} <AppSelect v-model="newRole" :options="roleOptions" /></label>
        <div class="row">
          <button class="btn-primary" :disabled="busy || !newUser || !newRole">{{ t('team.assign') }}</button>
          <button type="button" @click="assigning = false">{{ t('common.cancel') }}</button>
        </div>
      </form>
    </AppDialog>
  </div>
</template>

<style scoped>
.team-row { padding: 8px 0; flex-wrap: nowrap; }
.name { min-width: 0; overflow-wrap: anywhere; }
</style>
