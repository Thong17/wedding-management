<script setup lang="ts">
import axios from 'axios'
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { eventsApi, giftsApi, guestsApi } from '@/api/endpoints'
import { errorMessage } from '@/api/http'
import type { ApiEvent, ApiGift, ApiGuest, GuestInput, PermissionCode } from '@/api/types'
import AppIcon from '@/components/AppIcon.vue'
import AppSelect from '@/components/AppSelect.vue'
import EventTeam from '@/components/EventTeam.vue'
import { formatDateTime, formatGiftValue, methodLabel, methodOptions, sideLabel, sideOptions } from '@/utils/format'
import { downloadGuestCsvTemplate, exportGuestsXlsx } from '@/utils/guestExport'
import { can } from '@/utils/permissions'
import { toast } from '@/utils/toast'

const props = defineProps<{ id: string }>()
const eventId = computed(() => Number(props.id))
const router = useRouter()
const { t } = useI18n()

const event = ref<ApiEvent | null>(null)
const tab = ref<'guests' | 'gifts' | 'team'>('guests')
const error = ref<string | null>(null)

// What the signed-in user's role allows here. Screens hide what isn't allowed; the server checks again.
const allowed = (perm: PermissionCode) => can(event.value, perm)
const full = computed(() => !!event.value?.full_access)
const canSeeGifts = computed(() => allowed('gift_edit') || allowed('report_view'))
const teamCount = ref(0)
// The add/edit and import panel beside the guest list, only when the role can use any of it.
const guestSidePanel = computed(() => allowed('guest_add') || allowed('guest_edit') || allowed('guest_import'))

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
const editingGift = ref<{ gift: ApiGift; amount: string; method: ApiGift['method']; item: string; note: string } | null>(null)

async function load() {
  try {
    event.value = await eventsApi.get(eventId.value)
    await Promise.all([loadGuests(), canSeeGifts.value ? loadGifts() : null])
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
  editingGift.value = { gift: g, amount: g.amount ?? '', method: g.method, item: g.item, note: g.note }
}
async function saveGiftEdit() {
  const edit = editingGift.value
  if (!edit) return
  try {
    const isItem = edit.method === 'item'
    await giftsApi.update(eventId.value, edit.gift.id, {
      amount: isItem ? null : edit.amount,
      method: edit.method,
      item: isItem ? edit.item : '',
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
  if (!confirm(t('gifts.voidConfirm', { amount: formatGiftValue(g), name: g.guest_name }))) return
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
    toast(t('gifts.conflict', { amount: formatGiftValue(current) }), 'error', 6000)
    editingGift.value = null
    void loadGifts()
  } else {
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
          <div class="muted small">
            {{ event.date }}<span v-if="event.venue"> · {{ event.venue }}</span> · {{ event.currency }}<span v-if="event.client_name"> · {{ event.client_name }}</span>
            · {{ full ? t('detail.accessFull') : t('detail.accessAssigned') }}
          </div>
        </div>
        <span class="spacer" />
        <RouterLink v-if="allowed('gift_desk')" class="btn btn-primary" :to="`/events/${event.id}/desk`">{{ t('detail.giftDesk') }}</RouterLink>
        <RouterLink v-if="allowed('report_view')" class="btn" :to="`/events/${event.id}/report`">{{ t('detail.report') }}</RouterLink>
        <template v-if="allowed('guest_export')">
          <RouterLink class="btn" :to="`/events/${event.id}/qr`">{{ t('detail.qrSheet') }}</RouterLink>
          <button :disabled="exporting || !guests.length" @click="exportGuests">{{ exporting ? t('detail.exporting') : t('detail.exportGuests') }}</button>
        </template>
        <RouterLink v-if="full" class="btn" :to="`/events/${event.id}/edit`">{{ t('common.edit') }}</RouterLink>
      </div>

      <div class="tabs">
        <button :class="{ active: tab === 'guests' }" @click="tab = 'guests'">{{ t('detail.tabGuests', { n: guests.length }) }}</button>
        <button v-if="canSeeGifts" :class="{ active: tab === 'gifts' }" @click="tab = 'gifts'">{{ t('detail.tabGifts', { n: gifts.length }) }}</button>
        <button v-if="full" :class="{ active: tab === 'team' }" @click="tab = 'team'">{{ t('detail.tabTeam', { n: teamCount }) }}</button>
      </div>

      <!-- Guests -->
      <div v-if="tab === 'guests'" :class="{ 'grid-2': guestSidePanel }">
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
                  <td>
                    <div class="row-actions">
                      <button v-if="allowed('guest_edit')" class="btn-small" @click="editGuest(g)">{{ t('common.edit') }}</button>
                      <button v-if="allowed('guest_delete')" class="btn-small btn-danger" :aria-label="t('common.remove')" @click="deleteGuest(g)">✕</button>
                    </div>
                  </td>
                </tr>
                <tr v-if="!filteredGuests.length"><td colspan="5" class="muted">{{ t('guests.none') }}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
        <div v-if="guestSidePanel" class="stack">
          <form v-if="editingGuestId ? allowed('guest_edit') : allowed('guest_add')" class="card stack" @submit.prevent="saveGuest">
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
          <div v-if="allowed('guest_import')" class="card stack">
            <div class="row">
              <h2>{{ t('guests.importTitle') }}</h2>
              <span class="spacer" />
              <button type="button" class="btn-small" @click="downloadGuestCsvTemplate"><AppIcon name="download" :size="16" />{{ t('guests.downloadTemplate') }}</button>
            </div>
            <p class="muted small">{{ t('guests.importHelp') }} <span class="mono">full_name</span> {{ t('guests.required') }}, <span class="mono">nickname, phone, side (bride/groom/both), group, table_no</span>.</p>
            <p class="muted small">{{ t('guests.templateHelp') }}</p>
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
                  <td>
                    <input v-if="editingGift.method === 'item'" v-model="editingGift.item" maxlength="200" :placeholder="t('giftForm.itemPlaceholder')" :aria-label="t('giftForm.itemLabel')" style="min-width: 140px" />
                    <input v-else v-model="editingGift.amount" inputmode="decimal" :aria-label="t('gifts.amount')" style="width: 110px" />
                  </td>
                  <td><AppSelect v-model="editingGift.method" :options="methodOptions()" :aria-label="t('gifts.method')" /></td>
                  <td><input v-model="editingGift.note" maxlength="500" /></td>
                  <td></td>
                  <td>
                    <div class="row-actions">
                      <button class="btn-small btn-primary" @click="saveGiftEdit">{{ t('common.save') }}</button>
                      <button class="btn-small" @click="editingGift = null">{{ t('common.cancel') }}</button>
                    </div>
                  </td>
                </template>
                <template v-else>
                  <td class="small nowrap">{{ formatDateTime(g.client_created_at) }}</td>
                  <td>{{ g.guest_name }}<span v-if="!g.guest" class="badge badge-neutral">{{ t('common.walkIn') }}</span></td>
                  <td class="right" :class="{ nowrap: g.method !== 'item' }">{{ formatGiftValue(g) }}</td>
                  <td>{{ methodLabel(g.method) }}</td>
                  <td class="small">{{ g.note }}</td>
                  <td class="small">{{ g.recorded_by_username }}</td>
                  <td>
                    <div v-if="allowed('gift_edit')" class="row-actions">
                      <button class="btn-small" @click="startGiftEdit(g)">{{ t('common.edit') }}</button>
                      <button class="btn-small btn-danger" @click="voidGift(g)">{{ t('gifts.void') }}</button>
                    </div>
                  </td>
                </template>
              </tr>
              <tr v-if="!gifts.length"><td colspan="7" class="muted">{{ t('gifts.none') }}</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Team (customers and their roles); full access only. Kept mounted so the tab count stays right. -->
      <div v-if="full" v-show="tab === 'team'" class="card stack">
        <EventTeam :event="event" @count="teamCount = $event" />
        <div class="danger-zone"><button class="btn-danger btn-small" @click="deleteEvent">{{ t('members.deleteEvent') }}</button></div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.danger-zone { border-top: 1px solid var(--c-border); padding-top: 12px; }
</style>
