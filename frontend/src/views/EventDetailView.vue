<script setup lang="ts">
import axios from 'axios'
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { eventsApi, giftsApi, guestsApi } from '@/api/endpoints'
import { errorMessage } from '@/api/http'
import type { ApiEvent, ApiGift, ApiGuest, GuestInput, PermissionCode } from '@/api/types'
import AppDialog from '@/components/AppDialog.vue'
import AppSkeleton from '@/components/AppSkeleton.vue'
import AppIcon from '@/components/AppIcon.vue'
import AppSelect from '@/components/AppSelect.vue'
import EventForm from '@/components/EventForm.vue'
import EventTeam from '@/components/EventTeam.vue'
import { confirmDialog } from '@/utils/confirmDialog'
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
const canSeeGifts = computed(() => allowed('gift_edit') || allowed('gift_void') || allowed('report_view'))
const teamCount = ref(0)
// Forms open in dialogs.
const guestOpen = ref(false)
const importOpen = ref(false)
const editOpen = ref(false)
// "Save and add another" keeps the guest dialog open for the next one.
const addAnother = ref(false)
const guestNameInput = ref<HTMLInputElement | null>(null)

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
// Until the first load, the tables show placeholder rows instead of "none yet".
const guestsLoaded = ref(false)
const giftsLoaded = ref(false)
const loadGuests = async () => {
  guests.value = (await guestsApi.list(eventId.value)).results
  guestsLoaded.value = true
}

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
const loadGifts = async () => {
  gifts.value = await giftsApi.list(eventId.value)
  giftsLoaded.value = true
}

onMounted(load)

async function saveGuest() {
  try {
    if (editingGuestId.value) await guestsApi.update(eventId.value, editingGuestId.value, guestForm)
    else await guestsApi.create(eventId.value, guestForm)
    toast(editingGuestId.value ? t('guests.updated') : t('guests.added'))
    if (addAnother.value && !editingGuestId.value) {
      // Keep the side and group: guests are usually typed in a run from one family or table.
      Object.assign(guestForm, { ...emptyGuest(), side: guestForm.side, group: guestForm.group })
      await nextTick()
      guestNameInput.value?.focus()
    } else {
      guestOpen.value = false
    }
    await loadGuests()
  } catch (err) {
    toast(errorMessage(err), 'error')
  }
}
function startAddGuest() {
  editingGuestId.value = null
  Object.assign(guestForm, emptyGuest())
  guestOpen.value = true
}
function editGuest(g: ApiGuest) {
  editingGuestId.value = g.id
  Object.assign(guestForm, { full_name: g.full_name, nickname: g.nickname, phone: g.phone, side: g.side, group: g.group, table_no: g.table_no })
  guestOpen.value = true
}
function onEventSaved(updated: ApiEvent) {
  event.value = updated
  editOpen.value = false
}
async function deleteGuest(g: ApiGuest) {
  if (!(await confirmDialog({ message: t('guests.removeConfirm', { name: g.full_name }), confirmText: t('common.remove'), danger: true }))) return
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
  const message = t('gifts.voidConfirm', { amount: formatGiftValue(g), name: g.guest_name })
  if (!(await confirmDialog({ message, confirmText: t('gifts.void'), danger: true }))) return
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
  if (!(await confirmDialog({ message: t('members.deleteConfirm'), confirmText: t('members.deleteEvent'), danger: true }))) return
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
    <div v-if="event" class="stack fade-in">
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
        <button v-if="full" @click="editOpen = true">{{ t('common.edit') }}</button>
      </div>

      <div class="tabs">
        <button :class="{ active: tab === 'guests' }" @click="tab = 'guests'">{{ t('detail.tabGuests', { n: guests.length }) }}</button>
        <button v-if="canSeeGifts" :class="{ active: tab === 'gifts' }" @click="tab = 'gifts'">{{ t('detail.tabGifts', { n: gifts.length }) }}</button>
        <button v-if="full" :class="{ active: tab === 'team' }" @click="tab = 'team'">{{ t('detail.tabTeam', { n: teamCount }) }}</button>
      </div>

      <!-- Guests -->
      <div v-if="tab === 'guests'" class="card stack">
        <div class="row">
          <input v-model="guestFilter" :placeholder="t('guests.filter')" class="grow" />
          <button v-if="allowed('guest_import')" @click="importOpen = true"><AppIcon name="download" />{{ t('guests.importTitle') }}</button>
          <button v-if="allowed('guest_add')" class="btn-primary" @click="startAddGuest"><AppIcon name="plus" />{{ t('guests.addTitle') }}</button>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>{{ t('guests.name') }}</th><th>{{ t('guests.side') }}</th><th>{{ t('guests.groupTable') }}</th><th>{{ t('guests.phone') }}</th><th></th></tr></thead>
            <tbody>
              <tr v-for="g in filteredGuests" :key="g.id" class="fade-in">
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
              <template v-if="!guestsLoaded && !error"><AppSkeleton v-for="i in 6" :key="i" variant="row" :columns="5" /></template>
              <tr v-else-if="!filteredGuests.length"><td colspan="5" class="muted">{{ t('guests.none') }}</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <AppDialog v-model:open="guestOpen" :title="editingGuestId ? t('guests.editTitle') : t('guests.addTitle')">
        <form class="stack" @submit.prevent="saveGuest">
          <label>{{ t('guests.fullName') }} <input ref="guestNameInput" v-model="guestForm.full_name" required maxlength="200" /></label>
          <div class="row">
            <label class="grow">{{ t('guests.nickname') }} <input v-model="guestForm.nickname" maxlength="100" /></label>
            <label class="grow">{{ t('guests.phone') }} <input v-model="guestForm.phone" type="tel" maxlength="32" /></label>
          </div>
          <div class="row">
            <label class="grow">{{ t('guests.side') }} <AppSelect v-model="guestForm.side" :options="sideOptions()" /></label>
            <label class="grow">{{ t('guests.group') }} <input v-model="guestForm.group" maxlength="100" /></label>
            <label class="table-no">{{ t('guests.table') }} <input v-model="guestForm.table_no" maxlength="20" /></label>
          </div>
          <div class="row">
            <button class="btn-primary" @click="addAnother = false">{{ editingGuestId ? t('common.save') : t('guests.addTitle') }}</button>
            <!-- Keeps the dialog open for the next guest: handy when typing in a list. -->
            <button v-if="!editingGuestId" @click="addAnother = true">{{ t('guests.saveAndAdd') }}</button>
            <button type="button" @click="guestOpen = false">{{ t('common.cancel') }}</button>
          </div>
        </form>
      </AppDialog>

      <AppDialog v-model:open="importOpen" :title="t('guests.importTitle')">
        <div class="stack">
          <p class="muted small">{{ t('guests.importHelp') }} <span class="mono">full_name</span> {{ t('guests.required') }}, <span class="mono">nickname, phone, side (bride/groom/both), group, table_no</span>.</p>
          <p class="muted small">{{ t('guests.templateHelp') }}</p>
          <div><button type="button" class="btn-small" @click="downloadGuestCsvTemplate"><AppIcon name="download" :size="16" />{{ t('guests.downloadTemplate') }}</button></div>
          <input type="file" accept=".csv,text/csv" :aria-label="t('guests.importTitle')" @change="importCsv" />
          <div v-if="importResult" class="small">
            {{ t('guests.created', { n: importResult.created }) }}
            <ul v-if="importResult.errors.length" class="field-error">
              <li v-for="e in importResult.errors" :key="e.row">{{ t('guests.rowError', { row: e.row, errors: Object.entries(e.errors).map(([k, v]) => `${k}: ${v.join(' ')}`).join('; ') }) }}</li>
            </ul>
          </div>
          <div class="row"><button type="button" @click="importOpen = false">{{ t('common.close') }}</button></div>
        </div>
      </AppDialog>

      <!-- Gifts (server copy) -->
      <div v-if="tab === 'gifts'" class="card stack">
        <p class="muted small">{{ t('gifts.serverNote') }}</p>
        <div class="table-wrap">
          <table>
            <thead><tr><th>{{ t('gifts.when') }}</th><th>{{ t('gifts.guest') }}</th><th class="right">{{ t('gifts.amount') }}</th><th>{{ t('gifts.method') }}</th><th>{{ t('gifts.note') }}</th><th>{{ t('gifts.by') }}</th><th></th></tr></thead>
            <tbody>
              <tr v-for="g in gifts" :key="g.id" class="fade-in">
                <td class="small nowrap">{{ formatDateTime(g.client_created_at) }}</td>
                <td>{{ g.guest_name }}<span v-if="!g.guest" class="badge badge-neutral">{{ t('common.walkIn') }}</span></td>
                <td class="right" :class="{ nowrap: g.method !== 'item' }">{{ formatGiftValue(g) }}</td>
                <td>{{ methodLabel(g.method) }}</td>
                <td class="small">{{ g.note }}</td>
                <td class="small">{{ g.recorded_by_username }}</td>
                <td>
                  <div v-if="allowed('gift_edit') || allowed('gift_void')" class="row-actions">
                    <button v-if="allowed('gift_edit')" class="btn-small" @click="startGiftEdit(g)">{{ t('common.edit') }}</button>
                    <button v-if="allowed('gift_void')" class="btn-small btn-danger" @click="voidGift(g)">{{ t('gifts.void') }}</button>
                  </div>
                </td>
              </tr>
              <template v-if="!giftsLoaded && !error"><AppSkeleton v-for="i in 6" :key="i" variant="row" :columns="7" /></template>
              <tr v-else-if="!gifts.length"><td colspan="7" class="muted">{{ t('gifts.none') }}</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <AppDialog :open="editingGift !== null" :title="editingGift ? t('gifts.editTitle', { name: editingGift.gift.guest_name }) : ''" size="sm" @update:open="!$event && (editingGift = null)">
        <form v-if="editingGift" class="stack" @submit.prevent="saveGiftEdit">
          <p class="muted small">{{ formatDateTime(editingGift.gift.client_created_at) }} · {{ editingGift.gift.recorded_by_username }}</p>
          <label>{{ t('gifts.method') }} <AppSelect v-model="editingGift.method" :options="methodOptions()" /></label>
          <label v-if="editingGift.method === 'item'">{{ t('giftForm.itemLabel') }}
            <input v-model="editingGift.item" required maxlength="200" :placeholder="t('giftForm.itemPlaceholder')" /></label>
          <label v-else>{{ t('giftForm.amount', { currency: editingGift.gift.currency }) }}
            <input v-model="editingGift.amount" required inputmode="decimal" /></label>
          <label>{{ t('gifts.note') }} <input v-model="editingGift.note" maxlength="500" /></label>
          <div class="row">
            <button class="btn-primary">{{ t('common.save') }}</button>
            <button type="button" @click="editingGift = null">{{ t('common.cancel') }}</button>
          </div>
        </form>
      </AppDialog>

      <AppDialog v-model:open="editOpen" :title="t('eventForm.editTitle')">
        <EventForm v-if="editOpen" :event-id="event.id" @saved="onEventSaved" @cancel="editOpen = false" />
      </AppDialog>

      <!-- Team (customers and their roles); full access only. Kept mounted so the tab count stays right. -->
      <div v-if="full" v-show="tab === 'team'" class="card stack">
        <EventTeam :event="event" @count="teamCount = $event" />
        <div class="danger-zone"><button class="btn-danger btn-small" @click="deleteEvent">{{ t('members.deleteEvent') }}</button></div>
      </div>
    </div>
    <AppSkeleton v-else-if="!error" variant="page" />
  </div>
</template>

<style scoped>
.danger-zone { border-top: 1px solid var(--c-border); padding-top: 12px; }
.grow { flex: 1; min-width: 180px; }
.table-no { width: 110px; }
</style>
