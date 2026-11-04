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
import type { CachedEvent, CachedGuest } from '@/offline/db'
import { findGuestByQrRef } from '@/offline/guestCache'
import { parseScannedCode } from '@/offline/guestSearch'
import type { GiftInput } from '@/offline/transactionRepo'
import type { ApiEvent } from '@/api/types'
import { useEventsStore } from '@/stores/events'
import { useGiftDeskStore } from '@/stores/giftDesk'
import { formatGiftValue, formatMoney, formatRelative } from '@/utils/format'
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
// Phones show only the guest list; the gift form opens as a popup once a guest (or walk-in) is
// chosen. Wider screens keep the form beside the list.
const phoneQuery = window.matchMedia('(max-width: 859px)')
const isPhone = ref(phoneQuery.matches)
const onPhoneChange = (e: MediaQueryListEvent) => (isPhone.value = e.matches)
phoneQuery.addEventListener('change', onPhoneChange)
const formOpen = ref(false)

/** Open the gift form (the popup on phones) and wait until it is on screen. */
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
  selected.value ? desk.transactions.filter((t) => t.guestId === selected.value!.id).length : 0,
)
const recent = computed(() => desk.transactions.slice(0, 30))

onMounted(async () => {
  const res = await eventsStore.getEvent(eventId)
  event.value = res.event
  if (!res.event) loadError.value = t('desk.notCached')
  await desk.open(eventId)
})
onBeforeUnmount(() => {
  desk.close()
  phoneQuery.removeEventListener('change', onPhoneChange)
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
        <span class="muted small">{{ t('desk.recordedHere', { n: desk.transactions.length }) }}</span>
        <strong>{{ formatMoney(desk.localTotal, currency) }}</strong>
      </div>
    </div>
    <div v-if="loadError" class="banner banner-danger">{{ loadError }}</div>
    <div v-if="desk.guestRefreshError" class="banner banner-warn small">{{ desk.guestRefreshError }}</div>
    <div v-if="noDesk" class="banner banner-warn">{{ t('desk.noPermission') }}</div>

    <div v-if="!noDesk" :class="isPhone ? 'stack' : 'grid-2'">
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
        <button v-if="isPhone" type="button" class="walk-in-btn" @click="startWalkIn">
          <AppIcon name="plus" :size="16" />
          {{ t('desk.walkInButton') }}
        </button>
      </section>

      <!-- Phones: the form is a popup that opens once a guest or walk-in is chosen. -->
      <AppDialog v-if="isPhone" :open="formOpen" :title="t('desk.recordGift')" @update:open="onFormOpenChange">
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
        <RouterLink to="/sync" class="small">{{ t('desk.syncCenter') }}</RouterLink>
      </div>
      <TransactionList :items="recent" />
    </section>
  </div>
</template>

<style scoped>
.walk-in-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
.refresh-btn { flex-shrink: 0; min-height: 44px; height: 44px; }
.spinning { animation: refresh-spin 1s linear infinite; }
@keyframes refresh-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .spinning { animation: none; } }
</style>
