<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import GiftForm from '@/components/GiftForm.vue'
import GuestSearch from '@/components/GuestSearch.vue'
import OcrScanner from '@/components/OcrScanner.vue'
import QrScanner from '@/components/QrScanner.vue'
import TransactionList from '@/components/TransactionList.vue'
import type { CachedEvent, CachedGuest } from '@/offline/db'
import { findGuestByQrToken } from '@/offline/guestCache'
import { parseScannedCode } from '@/offline/guestSearch'
import type { GiftInput } from '@/offline/transactionRepo'
import type { ApiEvent } from '@/api/types'
import { useEventsStore } from '@/stores/events'
import { useGiftDeskStore } from '@/stores/giftDesk'
import { formatMoney, formatRelative } from '@/utils/format'
import { toast } from '@/utils/toast'

const props = defineProps<{ id: string }>()
const eventId = Number(props.id)
const desk = useGiftDeskStore()
const eventsStore = useEventsStore()

const event = ref<ApiEvent | CachedEvent | null>(null)
const loadError = ref<string | null>(null)
const mode = ref<'search' | 'qr' | 'ocr'>('search')
const query = ref('')
const selected = ref<CachedGuest | null>(null)
const searchRef = ref<InstanceType<typeof GuestSearch> | null>(null)

const currency = computed(() => event.value?.currency ?? 'USD')
const previousCount = computed(() =>
  selected.value ? desk.transactions.filter((t) => t.guestId === selected.value!.id).length : 0,
)
const recent = computed(() => desk.transactions.slice(0, 30))

onMounted(async () => {
  const res = await eventsStore.getEvent(eventId)
  event.value = res.event
  if (!res.event) loadError.value = 'This event is not saved on this device yet. Open it once while online.'
  await desk.open(eventId)
})
onBeforeUnmount(() => desk.close())

function selectGuest(g: CachedGuest) {
  selected.value = g
}

function clearGuest() {
  selected.value = null
  query.value = ''
  mode.value = 'search'
  setTimeout(() => searchRef.value?.focus())
}

async function onScan(text: string) {
  const parsed = parseScannedCode(text)
  if (parsed.kind === 'token') {
    const guest = await findGuestByQrToken(eventId, parsed.token)
    if (guest) {
      selectGuest(guest)
      toast(`Found ${guest.full_name}`, 'info', 2000)
      return
    }
    toast('QR code is not for a guest of this event.', 'error')
    return
  }
  onSearchText(text)
}

function onSearchText(text: string) {
  query.value = text
  mode.value = 'search'
}

async function submit(input: Omit<GiftInput, 'eventId'>) {
  const record = await desk.recordGift(input)
  toast(`✓ Saved ${formatMoney(record.amount, record.currency)} from ${record.guestNameSnapshot}`)
  clearGuest()
}
</script>

<template>
  <div class="container stack">
    <div class="row">
      <div>
        <h1>{{ event?.name ?? 'Gift desk' }}</h1>
        <div class="muted small">
          {{ desk.guests.length }} guests saved on this device · updated {{ formatRelative(desk.guestsCachedAt) }}
          <button class="btn-small" @click="desk.refreshGuests()" :disabled="desk.refreshingGuests">
            {{ desk.refreshingGuests ? 'Refreshing…' : '↻ Refresh guests' }}
          </button>
        </div>
      </div>
      <span class="spacer" />
      <div class="stat right">
        <span class="muted small">Recorded here ({{ desk.transactions.length }})</span>
        <strong>{{ formatMoney(desk.localTotal, currency) }}</strong>
      </div>
    </div>
    <div v-if="loadError" class="banner banner-danger">{{ loadError }}</div>
    <div v-if="desk.guestRefreshError" class="banner banner-warn small">{{ desk.guestRefreshError }}</div>

    <div class="grid-2">
      <section class="card stack">
        <div class="tabs">
          <button :class="{ active: mode === 'search' }" @click="mode = 'search'">🔎 Search</button>
          <button :class="{ active: mode === 'qr' }" @click="mode = 'qr'">▦ Scan QR</button>
          <button :class="{ active: mode === 'ocr' }" @click="mode = 'ocr'">📝 Scan text</button>
        </div>
        <QrScanner v-if="mode === 'qr'" @scan="onScan" />
        <OcrScanner v-if="mode === 'ocr'" @text="onSearchText" />
        <GuestSearch
          v-show="mode === 'search'"
          ref="searchRef"
          v-model="query"
          :searcher="desk.searcher"
          :gifted-guest-ids="desk.giftedGuestIds"
          :selected-id="selected?.id"
          @select="selectGuest"
        />
      </section>

      <section class="card stack">
        <h2>Record gift</h2>
        <GiftForm
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
        <h2>Recent on this device</h2>
        <span class="spacer" />
        <RouterLink to="/sync" class="small">Sync center →</RouterLink>
      </div>
      <TransactionList :items="recent" />
    </section>
  </div>
</template>
