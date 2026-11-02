<script setup lang="ts">
import axios from 'axios'
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { eventsApi, giftsApi, guestsApi } from '@/api/endpoints'
import { errorMessage } from '@/api/http'
import type { ApiEvent, ApiGift, ApiGuest, ApiMember, GuestInput } from '@/api/types'
import AppSelect from '@/components/AppSelect.vue'
import { formatDateTime, formatMoney, METHOD_LABELS, METHOD_OPTIONS, SIDE_LABELS, SIDE_OPTIONS } from '@/utils/format'
import { exportGuestsXlsx } from '@/utils/guestExport'
import { toast } from '@/utils/toast'

const props = defineProps<{ id: string }>()
const eventId = computed(() => Number(props.id))
const router = useRouter()

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
const ROLE_OPTIONS = [
  { value: 'manager' as const, label: 'Manager' },
  { value: 'owner' as const, label: 'Owner' },
]

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
    toast(`Export failed: ${errorMessage(err)}`, 'error')
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
    toast(editingGuestId.value ? 'Guest updated' : 'Guest added')
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
  if (!confirm(`Remove ${g.full_name} from the guest list? Gifts already recorded stay.`)) return
  await guestsApi.remove(eventId.value, g.id)
  await loadGuests()
}
async function importCsv(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    importResult.value = await guestsApi.importCsv(eventId.value, file)
    toast(`Imported ${importResult.value.created} guest(s)`)
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
    toast('Gift updated')
    editingGift.value = null
    await loadGifts()
  } catch (err) {
    handleGiftConflict(err)
  }
}
async function voidGift(g: ApiGift) {
  if (!confirm(`Void the gift of ${formatMoney(g.amount, g.currency)} from ${g.guest_name}?`)) return
  try {
    await giftsApi.void(eventId.value, g.id, g.updated_at)
    toast('Gift voided')
    await loadGifts()
  } catch (err) {
    handleGiftConflict(err)
  }
}
function handleGiftConflict(err: unknown) {
  if (axios.isAxiosError(err) && err.response?.status === 409) {
    const current = err.response.data.current as ApiGift
    toast(`Someone else changed this gift (now ${formatMoney(current.amount, current.currency)}). Reloaded — please review.`, 'error', 6000)
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
  if (!confirm(`Remove ${m.username}?`)) return
  try {
    await eventsApi.removeMember(eventId.value, m.user_id)
    await loadMembers()
  } catch (err) {
    toast(errorMessage(err), 'error')
  }
}
async function deleteEvent() {
  if (!confirm('Delete this event? This is only possible when no gifts were recorded.')) return
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
    <div v-if="error" class="banner banner-danger">{{ error }} <span class="muted">(Event management needs a connection; the gift desk works offline.)</span></div>
    <template v-if="event">
      <div class="row">
        <div>
          <h1>{{ event.name }}</h1>
          <div class="muted small">{{ event.date }}<span v-if="event.venue"> · {{ event.venue }}</span> · {{ event.currency }} · you are {{ event.role }}</div>
        </div>
        <span class="spacer" />
        <RouterLink class="btn btn-primary" :to="`/events/${event.id}/desk`">Gift desk</RouterLink>
        <RouterLink class="btn" :to="`/events/${event.id}/report`">Report</RouterLink>
        <RouterLink class="btn" :to="`/events/${event.id}/qr`">QR sheet</RouterLink>
        <button :disabled="exporting || !guests.length" @click="exportGuests">{{ exporting ? 'Exporting…' : 'Export guests' }}</button>
        <RouterLink v-if="isOwner" class="btn" :to="`/events/${event.id}/edit`">Edit</RouterLink>
      </div>

      <div class="tabs">
        <button :class="{ active: tab === 'guests' }" @click="tab = 'guests'">Guests ({{ guests.length }})</button>
        <button :class="{ active: tab === 'gifts' }" @click="tab = 'gifts'">Gifts ({{ gifts.length }})</button>
        <button :class="{ active: tab === 'members' }" @click="tab = 'members'">Managers ({{ members.length }})</button>
      </div>

      <!-- Guests -->
      <div v-if="tab === 'guests'" class="grid-2">
        <div class="card stack">
          <div class="row">
            <input v-model="guestFilter" placeholder="Filter guests…" style="flex: 1" />
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Side</th><th>Group / table</th><th>Phone</th><th></th></tr></thead>
              <tbody>
                <tr v-for="g in filteredGuests" :key="g.id">
                  <td>{{ g.full_name }}<div v-if="g.nickname" class="muted small">“{{ g.nickname }}”</div></td>
                  <td>{{ SIDE_LABELS[g.side] }}</td>
                  <td>{{ g.group }}<span v-if="g.table_no"> · T{{ g.table_no }}</span></td>
                  <td class="nowrap">{{ g.phone }}</td>
                  <td class="nowrap right">
                    <button class="btn-small" @click="editGuest(g)">Edit</button>
                    <button class="btn-small btn-danger" @click="deleteGuest(g)">✕</button>
                  </td>
                </tr>
                <tr v-if="!filteredGuests.length"><td colspan="5" class="muted">No guests.</td></tr>
              </tbody>
            </table>
          </div>
        </div>
        <div class="stack">
          <form class="card stack" @submit.prevent="saveGuest">
            <h2>{{ editingGuestId ? 'Edit guest' : 'Add guest' }}</h2>
            <label>Full name <input v-model="guestForm.full_name" required maxlength="200" /></label>
            <div class="row">
              <label style="flex: 1">Nickname <input v-model="guestForm.nickname" maxlength="100" /></label>
              <label style="flex: 1">Phone <input v-model="guestForm.phone" type="tel" maxlength="32" /></label>
            </div>
            <div class="row">
              <label style="flex: 1">Side
                <AppSelect v-model="guestForm.side" :options="SIDE_OPTIONS" />
              </label>
              <label style="flex: 1">Group <input v-model="guestForm.group" maxlength="100" /></label>
              <label style="flex: 1">Table <input v-model="guestForm.table_no" maxlength="20" /></label>
            </div>
            <div class="row">
              <button class="btn-primary">{{ editingGuestId ? 'Save' : 'Add guest' }}</button>
              <button v-if="editingGuestId" type="button" @click="cancelGuestEdit">Cancel</button>
            </div>
          </form>
          <div class="card stack">
            <h2>Import guests from CSV</h2>
            <p class="muted small">UTF-8 CSV with a header row. Columns: <span class="mono">full_name</span> (required), <span class="mono">nickname, phone, side (bride/groom/both), group, table_no</span>.</p>
            <input type="file" accept=".csv,text/csv" @change="importCsv" />
            <div v-if="importResult" class="small">
              Created {{ importResult.created }}.
              <ul v-if="importResult.errors.length" class="field-error">
                <li v-for="e in importResult.errors" :key="e.row">Row {{ e.row }}: {{ Object.entries(e.errors).map(([k, v]) => `${k}: ${v.join(' ')}`).join('; ') }}</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <!-- Gifts (server copy) -->
      <div v-if="tab === 'gifts'" class="card stack">
        <p class="muted small">Gifts confirmed by the server. Gifts still waiting on a device are shown in that device's Sync center.</p>
        <div class="table-wrap">
          <table>
            <thead><tr><th>When</th><th>Guest</th><th class="right">Amount</th><th>Method</th><th>Note</th><th>By</th><th></th></tr></thead>
            <tbody>
              <tr v-for="g in gifts" :key="g.id">
                <template v-if="editingGift?.gift.id === g.id">
                  <td class="small">{{ formatDateTime(g.client_created_at) }}</td>
                  <td>{{ g.guest_name }}</td>
                  <td><input v-model="editingGift.amount" inputmode="decimal" style="width: 110px" /></td>
                  <td><AppSelect v-model="editingGift.method" :options="METHOD_OPTIONS" aria-label="Method" /></td>
                  <td><input v-model="editingGift.note" maxlength="500" /></td>
                  <td></td>
                  <td class="nowrap"><button class="btn-small btn-primary" @click="saveGiftEdit">Save</button> <button class="btn-small" @click="editingGift = null">Cancel</button></td>
                </template>
                <template v-else>
                  <td class="small nowrap">{{ formatDateTime(g.client_created_at) }}</td>
                  <td>{{ g.guest_name }}<span v-if="!g.guest" class="badge badge-neutral">walk-in</span></td>
                  <td class="right nowrap">{{ formatMoney(g.amount, g.currency) }}</td>
                  <td>{{ METHOD_LABELS[g.method] }}</td>
                  <td class="small">{{ g.note }}</td>
                  <td class="small">{{ g.recorded_by_username }}</td>
                  <td class="nowrap right"><button class="btn-small" @click="startGiftEdit(g)">Edit</button> <button class="btn-small btn-danger" @click="voidGift(g)">Void</button></td>
                </template>
              </tr>
              <tr v-if="!gifts.length"><td colspan="7" class="muted">No gifts on the server yet.</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Members -->
      <div v-if="tab === 'members'" class="card stack">
        <ul class="list">
          <li v-for="m in members" :key="m.id" class="row" style="padding: 8px 0">
            <strong>{{ m.username }}</strong> <span class="badge badge-neutral">{{ m.role }}</span>
            <span class="spacer" />
            <button v-if="isOwner" class="btn-small btn-danger" @click="removeMember(m)">Remove</button>
          </li>
        </ul>
        <form v-if="isOwner" class="row" @submit.prevent="addMember">
          <input v-model="memberForm.username" placeholder="Username" required style="flex: 1; min-width: 160px" />
          <AppSelect v-model="memberForm.role" :options="ROLE_OPTIONS" aria-label="Role" inline />
          <button class="btn-primary">Add</button>
        </form>
        <p class="muted small">Managers can record gifts and manage guests. Accounts are created by an administrator in Django admin.</p>
        <div v-if="isOwner"><button class="btn-danger btn-small" @click="deleteEvent">Delete event</button></div>
      </div>
    </template>
  </div>
</template>
