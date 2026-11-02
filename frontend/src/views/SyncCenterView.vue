<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { authApi } from '@/api/endpoints'
import AppSelect from '@/components/AppSelect.vue'
import TransactionList from '@/components/TransactionList.vue'
import { onTransactionsChanged } from '@/offline/changes'
import type { CachedGuest, GiftMethod, GiftTransaction, TxnStatus } from '@/offline/db'
import { getCachedGuests } from '@/offline/guestCache'
import { createGuestSearcher } from '@/offline/guestSearch'
import {
  GiftValidationError,
  listTransactions,
  pruneSynced,
  retryFailed,
  toCsv,
  updateFailedTransaction,
} from '@/offline/transactionRepo'
import { useAuthStore } from '@/stores/auth'
import { useSyncStore } from '@/stores/sync'
import { downloadFile, formatDateTime, formatRelative, METHOD_OPTIONS } from '@/utils/format'
import { toast } from '@/utils/toast'

const sync = useSyncStore()
const auth = useAuthStore()
const filter = ref<TxnStatus | 'unsynced' | 'all'>('unsynced')
const FILTER_OPTIONS: { value: TxnStatus | 'unsynced' | 'all'; label: string }[] = [
  { value: 'unsynced', label: 'Not yet synced' },
  { value: 'failed', label: 'Failed' },
  { value: 'pending', label: 'Waiting' },
  { value: 'synced', label: 'Synced' },
  { value: 'all', label: 'All on this device' },
]
const rows = ref<GiftTransaction[]>([])
const serverCheck = ref<null | boolean>(null)

const visible = computed(() => {
  if (filter.value === 'all') return rows.value
  if (filter.value === 'unsynced') return rows.value.filter((t) => t.status !== 'synced')
  return rows.value.filter((t) => t.status === filter.value)
})
const otherUsers = computed(() => {
  const names = new Set(rows.value.filter((t) => t.status !== 'synced' && t.recordedBy !== auth.username).map((t) => t.recordedBy))
  return [...names]
})

async function load() {
  rows.value = await listTransactions()
}
let unsubscribe: (() => void) | null = null
onMounted(() => {
  void load()
  unsubscribe = onTransactionsChanged(() => void load())
})
onBeforeUnmount(() => unsubscribe?.())

async function retry(t?: GiftTransaction) {
  const n = await retryFailed(t ? [t.txnId] : undefined)
  toast(`${n} transaction(s) queued for retry`, 'info')
  await sync.syncNow()
}

async function checkServer() {
  serverCheck.value = null
  serverCheck.value = await authApi.health()
}

function exportRows(kind: 'json' | 'csv') {
  const data = visible.value
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  if (kind === 'json') downloadFile(`gifts-${filter.value}-${stamp}.json`, JSON.stringify(data, null, 2), 'application/json')
  else downloadFile(`gifts-${filter.value}-${stamp}.csv`, toCsv(data), 'text/csv')
}

async function prune() {
  if (!confirm('Remove gifts that the server confirmed more than 30 days ago from this device? Unsynced gifts are never removed.')) return
  toast(`Removed ${await pruneSynced(30)} old synced record(s) from this device`, 'info')
}

// Edit & retry
const editing = ref<GiftTransaction | null>(null)
const editForm = reactive({ amount: '', method: 'cash' as GiftMethod, note: '', walkInName: '', guestId: null as number | null, guestName: '' })
const editGuests = ref<CachedGuest[]>([])
const editQuery = ref('')
const editErrors = ref<Record<string, string>>({})
const editResults = computed(() => createGuestSearcher(editGuests.value).search(editQuery.value, 6))

async function startEdit(t: GiftTransaction) {
  editing.value = t
  editErrors.value = {}
  Object.assign(editForm, {
    amount: t.amount,
    method: t.method,
    note: t.note,
    walkInName: t.walkInName,
    guestId: t.guestId,
    guestName: t.guestId != null ? t.guestNameSnapshot : '',
  })
  editQuery.value = ''
  editGuests.value = await getCachedGuests(t.eventId)
}
watch(editQuery, () => (editErrors.value = {}))

async function saveEdit() {
  if (!editing.value) return
  try {
    await updateFailedTransaction(editing.value.txnId, { ...editForm })
    editing.value = null
    toast('Saved. Uploading…', 'info')
    await sync.syncNow()
  } catch (err) {
    if (err instanceof GiftValidationError) editErrors.value = err.errors as Record<string, string>
    else toast(err instanceof Error ? err.message : String(err), 'error')
  }
}
</script>

<template>
  <div class="container stack">
    <h1>Sync center</h1>

    <div class="card stack">
      <div class="stats">
        <div class="stat"><span class="badge badge-pending">Waiting</span><strong>{{ sync.counts.pending }}</strong></div>
        <div class="stat"><span class="badge badge-syncing">Uploading</span><strong>{{ sync.counts.syncing }}</strong></div>
        <div class="stat"><span class="badge badge-failed">Failed</span><strong>{{ sync.counts.failed }}</strong></div>
        <div class="stat"><span class="badge badge-synced">Synced</span><strong>{{ sync.counts.synced }}</strong></div>
      </div>
      <div class="small muted">
        Browser reports {{ sync.browserOnline ? 'online' : 'offline' }} · sync state: <strong>{{ sync.state }}</strong> · last successful sync
        {{ formatRelative(sync.snapshot.lastSyncAt) }}
        <span v-if="sync.snapshot.lastSyncAt">({{ formatDateTime(sync.snapshot.lastSyncAt) }})</span>
      </div>
      <div v-if="sync.snapshot.lastError" class="banner banner-warn small">Last problem: {{ sync.snapshot.lastError }}</div>
      <div v-if="sync.state === 'auth-required'" class="banner banner-danger small">
        Uploading is paused until you <RouterLink :to="{ name: 'login', query: { next: '/sync' } }">log in again</RouterLink>. Nothing is lost.
      </div>
      <div v-if="otherUsers.length" class="banner banner-info small">
        Some unsynced gifts were recorded by {{ otherUsers.join(', ') }}. They upload when that user logs in on this device.
      </div>
      <div class="row">
        <button class="btn-primary" @click="sync.syncNow()" :disabled="sync.state === 'syncing'">⟳ Sync now</button>
        <button @click="retry()" :disabled="!sync.counts.failed">Retry all failed</button>
        <button @click="checkServer">Check server</button>
        <span v-if="serverCheck !== null" class="badge" :class="serverCheck ? 'badge-synced' : 'badge-failed'">
          {{ serverCheck ? 'Server reachable' : 'Server unreachable' }}
        </span>
      </div>
    </div>

    <div class="card stack">
      <div class="row">
        <AppSelect v-model="filter" :options="FILTER_OPTIONS" aria-label="Filter records" inline />
        <span class="muted small">{{ visible.length }} record(s)</span>
        <span class="spacer" />
        <button class="btn-small" @click="exportRows('csv')" :disabled="!visible.length">Export CSV</button>
        <button class="btn-small" @click="exportRows('json')" :disabled="!visible.length">Export JSON</button>
        <button class="btn-small" @click="prune">Clear old synced</button>
      </div>

      <TransactionList :items="visible" show-event>
        <template #actions="{ item }">
          <div v-if="item.status === 'failed'" class="row">
            <button class="btn-small" @click="retry(item)">Retry</button>
            <button class="btn-small" @click="startEdit(item)">Edit &amp; retry</button>
            <span class="muted small mono">{{ item.errorCode }} · {{ item.txnId.slice(0, 8) }}</span>
          </div>
          <form v-if="editing?.txnId === item.txnId" class="card stack edit" @submit.prevent="saveEdit">
            <div class="row">
              <strong>Guest:</strong>
              <span v-if="editForm.guestId != null">{{ editForm.guestName }} <button type="button" class="btn-small" @click="editForm.guestId = null">Change</button></span>
              <template v-else>
                <input v-model="editQuery" placeholder="Search guest…" style="flex: 1; min-width: 160px" />
                <input v-model="editForm.walkInName" placeholder="…or walk-in name" style="flex: 1; min-width: 160px" />
              </template>
            </div>
            <div v-if="editForm.guestId == null && editResults.length" class="row">
              <button v-for="g in editResults" :key="g.id" type="button" class="btn-small" @click="Object.assign(editForm, { guestId: g.id, guestName: g.full_name })">
                {{ g.full_name }}
              </button>
            </div>
            <span class="field-error" v-if="editErrors.guest">{{ editErrors.guest }}</span>
            <div class="row">
              <label style="flex: 1">Amount <input v-model="editForm.amount" inputmode="decimal" /></label>
              <label style="flex: 1">Method
                <AppSelect v-model="editForm.method" :options="METHOD_OPTIONS" />
              </label>
            </div>
            <span class="field-error" v-if="editErrors.amount">{{ editErrors.amount }}</span>
            <label>Note <input v-model="editForm.note" maxlength="500" /></label>
            <div class="row">
              <button class="btn-primary btn-small">Save &amp; retry</button>
              <button type="button" class="btn-small" @click="editing = null">Cancel</button>
            </div>
          </form>
        </template>
      </TransactionList>
    </div>
  </div>
</template>

<style scoped>
.edit { background: var(--c-bg); }
</style>
