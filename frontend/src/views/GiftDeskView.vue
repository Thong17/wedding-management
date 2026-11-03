<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import GiftForm from '@/components/GiftForm.vue'
import GuestSearch from '@/components/GuestSearch.vue'
import OcrScanner from '@/components/OcrScanner.vue'
import QrScanner from '@/components/QrScanner.vue'
import TransactionList from '@/components/TransactionList.vue'
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
          <button class="btn-small" @click="desk.refreshGuests()" :disabled="desk.refreshingGuests">
            {{ desk.refreshingGuests ? t('desk.refreshing') : t('desk.refresh') }}
          </button>
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

    <div v-if="!noDesk" class="grid-2">
      <section class="card stack">
        <div class="tabs">
          <button :class="{ active: mode === 'search' }" @click="mode = 'search'">{{ t('desk.tabSearch') }}</button>
          <button :class="{ active: mode === 'qr' }" @click="mode = 'qr'">{{ t('desk.tabQr') }}</button>
          <button :class="{ active: mode === 'ocr' }" @click="mode = 'ocr'">{{ t('desk.tabOcr') }}</button>
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
        <h2>{{ t('desk.recordGift') }}</h2>
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
        <h2>{{ t('desk.recent') }}</h2>
        <span class="spacer" />
        <RouterLink to="/sync" class="small">{{ t('desk.syncCenter') }}</RouterLink>
      </div>
      <TransactionList :items="recent" />
    </section>
  </div>
</template>
