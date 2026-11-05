<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppDialog from '@/components/AppDialog.vue'
import AppIcon from '@/components/AppIcon.vue'
import GiftForm from '@/components/GiftForm.vue'
import GuestSearch from '@/components/GuestSearch.vue'
import OcrScanner from '@/components/OcrScanner.vue'
import QrScanner from '@/components/QrScanner.vue'
import TransactionList from '@/components/TransactionList.vue'
import AppTooltip from '@/components/AppTooltip.vue'
import AppSelect from '@/components/AppSelect.vue'
import type { CachedEvent, CachedGuest, GiftMethod, GiftTransaction } from '@/offline/db'
import { findGuestByQrRef } from '@/offline/guestCache'
import { parseScannedCode } from '@/offline/guestSearch'
import { GiftValidationError, isUnsynced, type GiftInput, type ValidationErrors } from '@/offline/transactionRepo'
import { errorMessage } from '@/api/http'
import type { ApiEvent } from '@/api/types'
import { useEventsStore } from '@/stores/events'
import { useGiftDeskStore } from '@/stores/giftDesk'
import { useSyncStore } from '@/stores/sync'
import { confirmDialog } from '@/utils/confirmDialog'
import { formatGiftValue, formatMoney, formatRelative, methodOptions } from '@/utils/format'
import { can } from '@/utils/permissions'
import { toast } from '@/utils/toast'

const props = defineProps<{ id: string }>()
const eventId = Number(props.id)
const desk = useGiftDeskStore()
const eventsStore = useEventsStore()
const { t } = useI18n()

const event = ref<ApiEvent | CachedEvent | null>(null)
const loadError = ref<string | null>(null)
const mode = ref<'search' | 'qr' | 'ocr'>('search')
const query = ref('')
const selected = ref<CachedGuest | null>(null)
const searchRef = ref<InstanceType<typeof GuestSearch> | null>(null)
const giftFormRef = ref<InstanceType<typeof GiftForm> | null>(null)
// Below 1200px (phones, tablets, small laptops) the guest list gets the full width and the gift form
// opens as a popup once a guest (or walk-in) is chosen. Wider screens keep the form beside the list.
const formDialogQuery = window.matchMedia('(max-width: 1199px)')
const formAsDialog = ref(formDialogQuery.matches)
const onLayoutChange = (e: MediaQueryListEvent) => (formAsDialog.value = e.matches)
formDialogQuery.addEventListener('change', onLayoutChange)
const formOpen = ref(false)

/** Open the gift form (the popup on narrower screens) and wait until it is on screen. */
async function openForm() {
  formOpen.value = true
  // The popup is mounted into <body> on open: give it a moment before focusing inside it.
  await nextTick()
  await nextTick()
}

const currency = computed(() => event.value?.currency ?? 'USD')
// From the event's stored permissions, so this also holds offline. The server re-checks every upload.
const noDesk = computed(() => !!event.value && !can(event.value, 'gift_desk'))
const previousCount = computed(() =>
  selected.value ? desk.giftCountFor(selected.value.id) : 0,
)
// Every desk's latest gifts, merged with this device's (including ones not uploaded yet).
const recent = computed(() => desk.recentGifts)

// Correcting or removing a recorded gift. Not uploaded yet: anyone at the desk, even offline.
// Already on the server: the "edit & void gifts" permission and a connection.
const sync = useSyncStore()
const canEditOnServer = computed(() => !!event.value && can(event.value, 'gift_edit'))
type GiftAccess = 'local' | 'server' | 'offline' | 'none'
function access(txn: GiftTransaction): GiftAccess {
  if (isUnsynced(txn)) return 'local'
  if (txn.status !== 'synced' || txn.voided || txn.serverGiftId == null || !canEditOnServer.value) return 'none'
  return sync.browserOnline ? 'server' : 'offline'
}

const editing = ref<{ txn: GiftTransaction; method: GiftMethod; amount: string; item: string; note: string } | null>(null)
const editErrors = ref<ValidationErrors>({})
const editError = ref<string | null>(null)
const savingEdit = ref(false)

function startEdit(txn: GiftTransaction) {
  editing.value = { txn, method: txn.method, amount: txn.amount ?? '', item: txn.item ?? '', note: txn.note }
  editErrors.value = {}
  editError.value = null
}

async function saveEdit() {
  const edit = editing.value
  if (!edit) return
  savingEdit.value = true
  editErrors.value = {}
  editError.value = null
  try {
    await desk.editGift(edit.txn, { method: edit.method, amount: edit.amount, item: edit.item, note: edit.note })
    editing.value = null
    toast(t('gifts.updated'))
  } catch (err) {
    if (err instanceof GiftValidationError) editErrors.value = err.errors
    else editError.value = errorMessage(err)
  } finally {
    savingEdit.value = false
  }
}

async function removeGift(txn: GiftTransaction) {
  const local = isUnsynced(txn)
  const values = { amount: formatGiftValue(txn), name: txn.guestNameSnapshot }
  const ok = await confirmDialog({
    message: local ? t('desk.deleteLocalConfirm', values) : t('gifts.voidConfirm', values),
    confirmText: local ? t('common.delete') : t('gifts.void'),
    danger: true,
  })
  if (!ok) return
  try {
    await desk.deleteGift(txn)
    toast(local ? t('desk.deleted') : t('gifts.voided'), 'info')
  } catch (err) {
    toast(errorMessage(err), 'error')
  }
}

onMounted(async () => {
  const res = await eventsStore.getEvent(eventId)
  event.value = res.event
  if (!res.event) loadError.value = t('desk.notCached')
  await desk.open(eventId)
})
onBeforeUnmount(() => {
  desk.close()
  formDialogQuery.removeEventListener('change', onLayoutChange)
})

async function selectGuest(g: CachedGuest) {
  selected.value = g
  await openForm()
  giftFormRef.value?.focusAmount()
}

function clearGuest() {
  selected.value = null
  formOpen.value = false
  query.value = ''
  mode.value = 'search'
  setTimeout(() => searchRef.value?.focus())
}

/** The popup was closed without recording: back to the list, keeping the search. */
function onFormOpenChange(open: boolean) {
  formOpen.value = open
  if (!open) selected.value = null
}

/** Someone not on the guest list: open the gift form with the walk-in name to fill in. */
async function startWalkIn() {
  selected.value = null
  await openForm()
  giftFormRef.value?.focusWalkIn()
}

async function onScan(text: string) {
  const parsed = parseScannedCode(text)
  if (parsed.kind !== 'text') {
    const guest = parsed.kind === 'other' ? undefined : await findGuestByQrRef(eventId, parsed)
    if (guest) {
      selectGuest(guest)
      toast(t('desk.found', { name: guest.full_name }), 'info', 2000)
      return
    }
    toast(t('desk.qrNotGuest'), 'error')
    return
  }
  onSearchText(text)
}

function onSearchText(text: string) {
  query.value = text
  mode.value = 'search'
}

/** A name read from a card that isn't on the guest list: record the gift under it as a walk-in. */
async function useWalkIn(name: string) {
  selected.value = null
  await openForm() // also lets the form show its walk-in field again before filling it
  giftFormRef.value?.setWalkIn(name)
  toast(t('desk.walkInFilled', { name }), 'info', 2500)
}

async function submit(input: Omit<GiftInput, 'eventId'>) {
  const record = await desk.recordGift(input)
  toast(t('desk.saved', { amount: formatGiftValue(record), name: record.guestNameSnapshot }))
  clearGuest()
}
</script>

<template>
  <div class="container stack">
    <div class="row">
      <div>
        <h1>{{ event?.name ?? t('desk.title') }}</h1>
        <div class="muted small">
          {{ t('desk.guestsSaved', { n: desk.guests.length, when: formatRelative(desk.guestsCachedAt) }) }}
        </div>
      </div>
      <span class="spacer" />
      <div class="stat right">
        <span class="muted small">{{ t('desk.recordedHere', { n: desk.counted.length }) }}</span>
        <strong>{{ formatMoney(desk.localTotal, currency) }}</strong>
      </div>
    </div>
    <div v-if="loadError" class="banner banner-danger">{{ loadError }}</div>
    <div v-if="desk.guestRefreshError" class="banner banner-warn small">{{ desk.guestRefreshError }}</div>
    <div v-if="noDesk" class="banner banner-warn">{{ t('desk.noPermission') }}</div>

    <div v-if="!noDesk" :class="formAsDialog ? 'stack' : 'grid-2'">
      <section class="card stack">
        <div class="tabs">
          <button :class="{ active: mode === 'search' }" @click="mode = 'search'">{{ t('desk.tabSearch') }}</button>
          <button :class="{ active: mode === 'qr' }" @click="mode = 'qr'">{{ t('desk.tabQr') }}</button>
          <button :class="{ active: mode === 'ocr' }" @click="mode = 'ocr'">{{ t('desk.tabOcr') }}</button>
        </div>
        <QrScanner v-if="mode === 'qr'" @scan="onScan" />
        <OcrScanner
          v-if="mode === 'ocr'"
          :searcher="desk.searcher"
          :gifted-guest-ids="desk.giftedGuestIds"
          @select="selectGuest"
          @walk-in="useWalkIn"
        />
        <GuestSearch
          v-show="mode === 'search'"
          ref="searchRef"
          v-model="query"
          :searcher="desk.searcher"
          :gifted-guest-ids="desk.giftedGuestIds"
          :selected-id="selected?.id"
          @select="selectGuest"
        >
          <template #actions>
            <AppTooltip :text="desk.refreshingGuests ? t('desk.refreshing') : t('desk.refresh')">
              <button
                type="button"
                class="btn-icon refresh-btn"
                :disabled="desk.refreshingGuests"
                :aria-label="desk.refreshingGuests ? t('desk.refreshing') : t('desk.refresh')"
                @click="desk.refreshGuests()"
              >
                <AppIcon name="sync" :size="18" :class="{ spinning: desk.refreshingGuests }" />
              </button>
            </AppTooltip>
          </template>
        </GuestSearch>
        <!-- On wide screens the walk-in field is always visible in the gift form beside this. -->
        <button v-if="formAsDialog" type="button" class="walk-in-btn" @click="startWalkIn">
          <AppIcon name="plus" :size="16" />
          {{ t('desk.walkInButton') }}
        </button>
      </section>

      <!-- Below 1200px: the form is a popup that opens once a guest or walk-in is chosen. -->
      <AppDialog v-if="formAsDialog" :open="formOpen" :title="t('desk.recordGift')" @update:open="onFormOpenChange">
        <GiftForm
          ref="giftFormRef"
          :guest="selected"
          :currency="currency"
          :event-id="eventId"
          :previous-count="previousCount"
          :submit="submit"
          @clear-guest="clearGuest"
        />
      </AppDialog>
      <section v-else class="card stack">
        <h2>{{ t('desk.recordGift') }}</h2>
        <GiftForm
          ref="giftFormRef"
          :guest="selected"
          :currency="currency"
          :event-id="eventId"
          :previous-count="previousCount"
          :submit="submit"
          @clear-guest="clearGuest"
        />
      </section>
    </div>

    <section class="card stack">
      <div class="row">
        <h2>{{ t('desk.recent') }}</h2>
        <span class="spacer" />
        <RouterLink to="/sync" class="btn btn-small sync-center-btn">
          <AppIcon name="sync" :size="16" />{{ t('desk.syncCenter') }}
        </RouterLink>
      </div>
      <TransactionList :items="recent">
        <template #actions="{ item }">
          <div v-if="access(item) !== 'none'" class="row-actions">
            <AppTooltip :text="access(item) === 'offline' ? t('desk.needsConnection') : null">
              <span class="tooltip-wrap">
                <button type="button" class="btn-small" :disabled="access(item) === 'offline'" @click="startEdit(item)">
                  <AppIcon name="edit" :size="14" />{{ t('common.edit') }}
                </button>
              </span>
            </AppTooltip>
            <AppTooltip :text="access(item) === 'offline' ? t('desk.needsConnection') : null">
              <span class="tooltip-wrap">
                <button type="button" class="btn-small btn-danger" :disabled="access(item) === 'offline'" @click="removeGift(item)">
                  <AppIcon name="trash" :size="14" />{{ access(item) === 'local' ? t('common.delete') : t('gifts.void') }}
                </button>
              </span>
            </AppTooltip>
          </div>
        </template>
      </TransactionList>
    </section>

    <AppDialog
      :open="editing !== null"
      :title="editing ? t('gifts.editTitle', { name: editing.txn.guestNameSnapshot }) : ''"
      :description="editing && isUnsynced(editing.txn) ? t('desk.editLocalHint') : t('desk.editServerHint')"
      size="sm"
      @update:open="!$event && (editing = null)"
    >
      <form v-if="editing" class="stack" @submit.prevent="saveEdit">
        <label>{{ t('gifts.method') }} <AppSelect v-model="editing.method" :options="methodOptions()" /></label>
        <label v-if="editing.method === 'item'">
          {{ t('giftForm.itemLabel') }}
          <input v-model="editing.item" maxlength="200" :placeholder="t('giftForm.itemPlaceholder')" />
          <span class="field-error" v-if="editErrors.item">{{ editErrors.item }}</span>
        </label>
        <label v-else>
          {{ t('giftForm.amount', { currency: editing.txn.currency }) }}
          <input v-model="editing.amount" inputmode="decimal" autocomplete="off" />
          <span class="field-error" v-if="editErrors.amount">{{ editErrors.amount }}</span>
        </label>
        <label>{{ t('gifts.note') }} <input v-model="editing.note" maxlength="500" /></label>
        <p v-if="editError" class="banner banner-danger small">{{ editError }}</p>
        <div class="row">
          <span class="spacer" />
          <button type="button" @click="editing = null">{{ t('common.cancel') }}</button>
          <button type="submit" class="btn-primary" :disabled="savingEdit">{{ t('common.save') }}</button>
        </div>
      </form>
    </AppDialog>
  </div>
</template>

<style scoped>
.walk-in-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
.sync-center-btn { display: inline-flex; align-items: center; gap: 6px; text-decoration: none; }
.refresh-btn { flex-shrink: 0; min-height: 44px; height: 44px; }
.row-actions { justify-content: flex-start; margin-top: 2px; }
.row-actions .btn-small { display: inline-flex; align-items: center; gap: 4px; }
.tooltip-wrap { display: inline-flex; }
.spinning { animation: refresh-spin 1s linear infinite; }
@keyframes refresh-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .spinning { animation: none; } }
</style>
