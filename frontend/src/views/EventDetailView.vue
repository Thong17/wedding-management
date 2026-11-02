<script setup lang="ts">
import axios from 'axios'
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { eventsApi, giftsApi, guestsApi } from '@/api/endpoints'
import { errorMessage } from '@/api/http'
import type { ApiEvent, ApiGift, ApiGuest, ApiMember, GuestInput } from '@/api/types'
import AppSelect from '@/components/AppSelect.vue'
import { formatDateTime, formatMoney, methodLabel, methodOptions, sideLabel, sideOptions } from '@/utils/format'
import { exportGuestsXlsx } from '@/utils/guestExport'
import { toast } from '@/utils/toast'

const props = defineProps<{ id: string }>()
const eventId = computed(() => Number(props.id))
const router = useRouter()
const { t } = useI18n()

const event = ref<ApiEvent | null>(null)
const tab = ref<'guests' | 'gifts' | 'members'>('guests')
const error = ref<string | null>(null)
const isOwner = computed(() => event.value?.role === 'owner')

// Guests
const guests = ref<ApiGuest[]>([])
const guestFilter = ref('')
const emptyGuest = (): GuestInput => ({ full_name: '', nickname: '', phone: '', side: 'both', group: '', table_no: '' })
const guestForm = reactive<GuestInput>(emptyGuest())
const editingGuestId = ref<number | null>(null)
const importResult = ref<{ created: number; errors: { row: number; errors: Record<string, string[]> }[] } | null>(null)
const filteredGuests = computed(() => {
  const q = guestFilter.value.toLowerCase()
  return q ? guests.value.filter((g) => `${g.full_name} ${g.nickname} ${g.phone} ${g.group}`.toLowerCase().includes(q)) : guests.value
})

// Gifts
const gifts = ref<ApiGift[]>([])
const editingGift = ref<{ gift: ApiGift; amount: string; method: ApiGift['method']; note: string } | null>(null)

// Members
const members = ref<ApiMember[]>([])
const memberForm = reactive({ username: '', role: 'manager' as 'owner' | 'manager' })
const roleOptions = computed(() => [
  { value: 'manager' as const, label: t('role.manager') },
  { value: 'owner' as const, label: t('role.owner') },
])

async function load() {
  try {
    event.value = await eventsApi.get(eventId.value)
    await Promise.all([loadGuests(), loadGifts(), loadMembers()])
  } catch (err) {
    error.value = errorMessage(err)
  }
}
const loadGuests = async () => (guests.value = (await guestsApi.list(eventId.value)).results)

const exporting = ref(false)
async function exportGuests() {
  if (!event.value) return
  exporting.value = true
  try {
    await exportGuestsXlsx(event.value, guests.value)
  } catch (err) {
    toast(t('detail.exportFailed', { error: errorMessage(err) }), 'error')
  } finally {
    exporting.value = false
  }
}
const loadGifts = async () => (gifts.value = await giftsApi.list(eventId.value))
const loadMembers = async () => (members.value = await eventsApi.members(eventId.value))

onMounted(load)

async function saveGuest() {
  try {
    if (editingGuestId.value) await guestsApi.update(eventId.value, editingGuestId.value, guestForm)
    else await guestsApi.create(eventId.value, guestForm)
    toast(editingGuestId.value ? t('guests.updated') : t('guests.added'))
    cancelGuestEdit()
    await loadGuests()
  } catch (err) {
    toast(errorMessage(err), 'error')
  }
}
function editGuest(g: ApiGuest) {
  editingGuestId.value = g.id
  Object.assign(guestForm, { full_name: g.full_name, nickname: g.nickname, phone: g.phone, side: g.side, group: g.group, table_no: g.table_no })
}
function cancelGuestEdit() {
  editingGuestId.value = null
  Object.assign(guestForm, emptyGuest())
}
async function deleteGuest(g: ApiGuest) {
  if (!confirm(t('guests.removeConfirm', { name: g.full_name }))) return
  await guestsApi.remove(eventId.value, g.id)
  await loadGuests()
}
async function importCsv(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    importResult.value = await guestsApi.importCsv(eventId.value, file)
    toast(t('guests.imported', { n: importResult.value.created }))
    await loadGuests()
  } catch (err) {
    toast(errorMessage(err), 'error')
  } finally {
    ;(e.target as HTMLInputElement).value = ''
  }
}

function startGiftEdit(g: ApiGift) {
  editingGift.value = { gift: g, amount: g.amount, method: g.method, note: g.note }
}
async function saveGiftEdit() {
  const edit = editingGift.value
  if (!edit) return
  try {
    await giftsApi.update(eventId.value, edit.gift.id, {
      amount: edit.amount,
      method: edit.method,
      note: edit.note,
      updated_at: edit.gift.updated_at,
    })
    toast(t('gifts.updated'))
    editingGift.value = null
    await loadGifts()
  } catch (err) {
    handleGiftConflict(err)
  }
}
async function voidGift(g: ApiGift) {
  if (!confirm(t('gifts.voidConfirm', { amount: formatMoney(g.amount, g.currency), name: g.guest_name }))) return
  try {
    await giftsApi.void(eventId.value, g.id, g.updated_at)
    toast(t('gifts.voided'))
    await loadGifts()
  } catch (err) {
    handleGiftConflict(err)
  }
}
function handleGiftConflict(err: unknown) {
  if (axios.isAxiosError(err) && err.response?.status === 409) {
    const current = err.response.data.current as ApiGift
    toast(t('gifts.conflict', { amount: formatMoney(current.amount, current.currency) }), 'error', 6000)
    editingGift.value = null
    void loadGifts()
  } else {
    toast(errorMessage(err), 'error')
  }
}

async function addMember() {
  try {
    await eventsApi.addMember(eventId.value, memberForm.username.trim(), memberForm.role)
    memberForm.username = ''
    await loadMembers()
  } catch (err) {
    toast(errorMessage(err), 'error')
  }
}
async function removeMember(m: ApiMember) {
  if (!confirm(t('members.removeConfirm', { name: m.username }))) return
  try {
    await eventsApi.removeMember(eventId.value, m.user_id)
    await loadMembers()
  } catch (err) {
    toast(errorMessage(err), 'error')
  }
}
async function deleteEvent() {
  if (!confirm(t('members.deleteConfirm'))) return
  try {
    await eventsApi.remove(eventId.value)
    router.push('/')
  } catch (err) {
    toast(errorMessage(err), 'error')
  }
}
</script>

<template>
  <div class="container stack">
    <div v-if="error" class="banner banner-danger">{{ error }} <span class="muted">{{ t('detail.needsConnection') }}</span></div>
    <template v-if="event">
      <div class="row">
        <div>
          <h1>{{ event.name }}</h1>
          <div class="muted small">{{ event.date }}<span v-if="event.venue"> · {{ event.venue }}</span> · {{ event.currency }} · {{ t('detail.youAre', { role: t(`role.${event.role}`) }) }}</div>
        </div>
        <span class="spacer" />
        <RouterLink class="btn btn-primary" :to="`/events/${event.id}/desk`">{{ t('detail.giftDesk') }}</RouterLink>
        <RouterLink class="btn" :to="`/events/${event.id}/report`">{{ t('detail.report') }}</RouterLink>
        <RouterLink class="btn" :to="`/events/${event.id}/qr`">{{ t('detail.qrSheet') }}</RouterLink>
        <button :disabled="exporting || !guests.length" @click="exportGuests">{{ exporting ? t('detail.exporting') : t('detail.exportGuests') }}</button>
        <RouterLink v-if="isOwner" class="btn" :to="`/events/${event.id}/edit`">{{ t('common.edit') }}</RouterLink>
      </div>

      <div class="tabs">
        <button :class="{ active: tab === 'guests' }" @click="tab = 'guests'">{{ t('detail.tabGuests', { n: guests.length }) }}</button>
        <button :class="{ active: tab === 'gifts' }" @click="tab = 'gifts'">{{ t('detail.tabGifts', { n: gifts.length }) }}</button>
        <button :class="{ active: tab === 'members' }" @click="tab = 'members'">{{ t('detail.tabManagers', { n: members.length }) }}</button>
      </div>

      <!-- Guests -->
      <div v-if="tab === 'guests'" class="grid-2">
        <div class="card stack">
          <div class="row">
            <input v-model="guestFilter" :placeholder="t('guests.filter')" style="flex: 1" />
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>{{ t('guests.name') }}</th><th>{{ t('guests.side') }}</th><th>{{ t('guests.groupTable') }}</th><th>{{ t('guests.phone') }}</th><th></th></tr></thead>
              <tbody>
                <tr v-for="g in filteredGuests" :key="g.id">
                  <td>{{ g.full_name }}<div v-if="g.nickname" class="muted small">“{{ g.nickname }}”</div></td>
                  <td>{{ sideLabel(g.side) }}</td>
                  <td>{{ g.group }}<span v-if="g.table_no"> · {{ t('guests.tableShort', { n: g.table_no }) }}</span></td>
                  <td class="nowrap">{{ g.phone }}</td>
                  <td class="nowrap right">
                    <button class="btn-small" @click="editGuest(g)">{{ t('common.edit') }}</button>
                    <button class="btn-small btn-danger" :aria-label="t('common.remove')" @click="deleteGuest(g)">✕</button>
                  </td>
                </tr>
                <tr v-if="!filteredGuests.length"><td colspan="5" class="muted">{{ t('guests.none') }}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
        <div class="stack">
          <form class="card stack" @submit.prevent="saveGuest">
            <h2>{{ editingGuestId ? t('guests.editTitle') : t('guests.addTitle') }}</h2>
            <label>{{ t('guests.fullName') }} <input v-model="guestForm.full_name" required maxlength="200" /></label>
            <div class="row">
              <label style="flex: 1">{{ t('guests.nickname') }} <input v-model="guestForm.nickname" maxlength="100" /></label>
              <label style="flex: 1">{{ t('guests.phone') }} <input v-model="guestForm.phone" type="tel" maxlength="32" /></label>
            </div>
            <div class="row">
              <label style="flex: 1">{{ t('guests.side') }}
                <AppSelect v-model="guestForm.side" :options="sideOptions()" />
              </label>
              <label style="flex: 1">{{ t('guests.group') }} <input v-model="guestForm.group" maxlength="100" /></label>
              <label style="flex: 1">{{ t('guests.table') }} <input v-model="guestForm.table_no" maxlength="20" /></label>
            </div>
            <div class="row">
              <button class="btn-primary">{{ editingGuestId ? t('common.save') : t('guests.addTitle') }}</button>
              <button v-if="editingGuestId" type="button" @click="cancelGuestEdit">{{ t('common.cancel') }}</button>
            </div>
          </form>
          <div class="card stack">
            <h2>{{ t('guests.importTitle') }}</h2>
            <p class="muted small">{{ t('guests.importHelp') }} <span class="mono">full_name</span> {{ t('guests.required') }}, <span class="mono">nickname, phone, side (bride/groom/both), group, table_no</span>.</p>
            <input type="file" accept=".csv,text/csv" @change="importCsv" />
            <div v-if="importResult" class="small">
              {{ t('guests.created', { n: importResult.created }) }}
              <ul v-if="importResult.errors.length" class="field-error">
                <li v-for="e in importResult.errors" :key="e.row">{{ t('guests.rowError', { row: e.row, errors: Object.entries(e.errors).map(([k, v]) => `${k}: ${v.join(' ')}`).join('; ') }) }}</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <!-- Gifts (server copy) -->
      <div v-if="tab === 'gifts'" class="card stack">
        <p class="muted small">{{ t('gifts.serverNote') }}</p>
        <div class="table-wrap">
          <table>
            <thead><tr><th>{{ t('gifts.when') }}</th><th>{{ t('gifts.guest') }}</th><th class="right">{{ t('gifts.amount') }}</th><th>{{ t('gifts.method') }}</th><th>{{ t('gifts.note') }}</th><th>{{ t('gifts.by') }}</th><th></th></tr></thead>
            <tbody>
              <tr v-for="g in gifts" :key="g.id">
                <template v-if="editingGift?.gift.id === g.id">
                  <td class="small">{{ formatDateTime(g.client_created_at) }}</td>
                  <td>{{ g.guest_name }}</td>
                  <td><input v-model="editingGift.amount" inputmode="decimal" style="width: 110px" /></td>
                  <td><AppSelect v-model="editingGift.method" :options="methodOptions()" :aria-label="t('gifts.method')" /></td>
                  <td><input v-model="editingGift.note" maxlength="500" /></td>
                  <td></td>
                  <td class="nowrap"><button class="btn-small btn-primary" @click="saveGiftEdit">{{ t('common.save') }}</button> <button class="btn-small" @click="editingGift = null">{{ t('common.cancel') }}</button></td>
                </template>
                <template v-else>
                  <td class="small nowrap">{{ formatDateTime(g.client_created_at) }}</td>
                  <td>{{ g.guest_name }}<span v-if="!g.guest" class="badge badge-neutral">{{ t('common.walkIn') }}</span></td>
                  <td class="right nowrap">{{ formatMoney(g.amount, g.currency) }}</td>
                  <td>{{ methodLabel(g.method) }}</td>
                  <td class="small">{{ g.note }}</td>
                  <td class="small">{{ g.recorded_by_username }}</td>
                  <td class="nowrap right"><button class="btn-small" @click="startGiftEdit(g)">{{ t('common.edit') }}</button> <button class="btn-small btn-danger" @click="voidGift(g)">{{ t('gifts.void') }}</button></td>
                </template>
              </tr>
              <tr v-if="!gifts.length"><td colspan="7" class="muted">{{ t('gifts.none') }}</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Members -->
      <div v-if="tab === 'members'" class="card stack">
        <ul class="list">
          <li v-for="m in members" :key="m.id" class="row" style="padding: 8px 0">
            <strong>{{ m.username }}</strong> <span class="badge badge-neutral">{{ t(`role.${m.role}`) }}</span>
            <span class="spacer" />
            <button v-if="isOwner" class="btn-small btn-danger" @click="removeMember(m)">{{ t('common.remove') }}</button>
          </li>
        </ul>
        <form v-if="isOwner" class="row" @submit.prevent="addMember">
          <input v-model="memberForm.username" :placeholder="t('members.username')" required style="flex: 1; min-width: 160px" />
          <AppSelect v-model="memberForm.role" :options="roleOptions" :aria-label="t('members.role')" inline />
          <button class="btn-primary">{{ t('common.add') }}</button>
        </form>
        <p class="muted small">{{ t('members.help') }}</p>
        <div v-if="isOwner"><button class="btn-danger btn-small" @click="deleteEvent">{{ t('members.deleteEvent') }}</button></div>
      </div>
    </template>
  </div>
</template>
