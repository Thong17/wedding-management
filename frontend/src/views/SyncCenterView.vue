<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { authApi } from '@/api/endpoints'
import AppSelect from '@/components/AppSelect.vue'
import TransactionList from '@/components/TransactionList.vue'
import { onTransactionsChanged } from '@/offline/changes'
import type { CachedGuest, GiftMethod, GiftTransaction, TxnStatus } from '@/offline/db'
import { getCachedGuests } from '@/offline/guestCache'
import { createGuestSearcher } from '@/offline/guestSearch'
import {
  GiftValidationError,
  isRecordedBy,
  listTransactions,
  pruneSynced,
  retryFailed,
  toCsv,
  updateFailedTransaction,
} from '@/offline/transactionRepo'
import { useAuthStore } from '@/stores/auth'
import { useSyncStore } from '@/stores/sync'
import { downloadFile, formatDateTime, formatRelative, methodOptions } from '@/utils/format'
import { toast } from '@/utils/toast'

const sync = useSyncStore()
const auth = useAuthStore()
const { t } = useI18n()
const filter = ref<TxnStatus | 'unsynced' | 'all'>('unsynced')
const filterOptions = computed<{ value: TxnStatus | 'unsynced' | 'all'; label: string }[]>(() => [
  { value: 'unsynced', label: t('sync.filterUnsynced') },
  { value: 'failed', label: t('sync.filterFailed') },
  { value: 'pending', label: t('sync.filterPending') },
  { value: 'synced', label: t('sync.filterSynced') },
  { value: 'all', label: t('sync.filterAll') },
])
const STATE_KEYS = { idle: 'idle', syncing: 'syncing', offline: 'offline', 'auth-required': 'authRequired', error: 'error' } as const
const stateLabel = computed(() => t(`sync.states.${STATE_KEYS[sync.state]}`))
const rows = ref<GiftTransaction[]>([])
const serverCheck = ref<null | boolean>(null)

const visible = computed(() => {
  if (filter.value === 'all') return rows.value
  if (filter.value === 'unsynced') return rows.value.filter((txn) => txn.status !== 'synced')
  return rows.value.filter((txn) => txn.status === filter.value)
})
const otherUsers = computed(() => {
  const me = auth.recorder
  const names = new Set(rows.value.filter((txn) => txn.status !== 'synced' && (!me || !isRecordedBy(txn, me))).map((txn) => txn.recordedBy))
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

async function retry(txn?: GiftTransaction) {
  const n = await retryFailed(txn ? [txn.txnId] : undefined)
  toast(t('sync.retryQueued', { n }), 'info')
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
  if (!confirm(t('sync.pruneConfirm'))) return
  toast(t('sync.pruned', { n: await pruneSynced(30) }), 'info')
}

// Edit & retry
const editing = ref<GiftTransaction | null>(null)
const editForm = reactive({ amount: '', method: 'cash' as GiftMethod, item: '', note: '', walkInName: '', guestId: null as number | null, guestName: '' })
const editGuests = ref<CachedGuest[]>([])
const editQuery = ref('')
const editErrors = ref<Record<string, string>>({})
const editResults = computed(() => createGuestSearcher(editGuests.value).search(editQuery.value, 6))

async function startEdit(txn: GiftTransaction) {
  editing.value = txn
  editErrors.value = {}
  Object.assign(editForm, {
    amount: txn.amount ?? '',
    method: txn.method,
    item: txn.item ?? '',
    note: txn.note,
    walkInName: txn.walkInName,
    guestId: txn.guestId,
    guestName: txn.guestId != null ? txn.guestNameSnapshot : '',
  })
  editQuery.value = ''
  editGuests.value = await getCachedGuests(txn.eventId)
}
watch(editQuery, () => (editErrors.value = {}))

async function saveEdit() {
  if (!editing.value) return
  try {
    await updateFailedTransaction(editing.value.txnId, { ...editForm })
    editing.value = null
    toast(t('sync.savedUploading'), 'info')
    await sync.syncNow()
  } catch (err) {
    if (err instanceof GiftValidationError) editErrors.value = err.errors as Record<string, string>
    else toast(err instanceof Error ? err.message : String(err), 'error')
  }
}
</script>

<template>
  <div class="container stack">
    <h1>{{ t('sync.title') }}</h1>

    <div class="card stack">
      <div class="stats">
        <div class="stat"><span class="badge badge-pending">{{ t('sync.waiting') }}</span><strong>{{ sync.counts.pending }}</strong></div>
        <div class="stat"><span class="badge badge-syncing">{{ t('sync.uploading') }}</span><strong>{{ sync.counts.syncing }}</strong></div>
        <div class="stat"><span class="badge badge-failed">{{ t('sync.failed') }}</span><strong>{{ sync.counts.failed }}</strong></div>
        <div class="stat"><span class="badge badge-synced">{{ t('sync.synced') }}</span><strong>{{ sync.counts.synced }}</strong></div>
      </div>
      <div class="small muted">
        {{ t('sync.browser', { state: sync.browserOnline ? t('sync.online') : t('sync.offline') }) }} · {{ t('sync.state') }}: <strong>{{ stateLabel }}</strong> ·
        {{ t('sync.lastSync', { when: formatRelative(sync.snapshot.lastSyncAt) }) }}
        <span v-if="sync.snapshot.lastSyncAt">({{ formatDateTime(sync.snapshot.lastSyncAt) }})</span>
      </div>
      <div v-if="sync.snapshot.lastError" class="banner banner-warn small">{{ t('sync.lastProblem', { error: sync.snapshot.lastError }) }}</div>
      <i18n-t v-if="sync.state === 'auth-required'" keypath="sync.paused" tag="div" class="banner banner-danger small">
        <template #link><RouterLink :to="{ name: 'login', query: { next: '/sync' } }">{{ t('sync.pausedLink') }}</RouterLink></template>
      </i18n-t>
      <div v-if="otherUsers.length" class="banner banner-info small">
        {{ t('sync.otherUsers', { names: otherUsers.join(', ') }) }}
      </div>
      <div class="row">
        <button class="btn-primary" @click="sync.syncNow()" :disabled="sync.state === 'syncing'">{{ t('sync.syncNow') }}</button>
        <button @click="retry()" :disabled="!sync.counts.failed">{{ t('sync.retryAll') }}</button>
        <button @click="checkServer">{{ t('sync.checkServer') }}</button>
        <span v-if="serverCheck !== null" class="badge" :class="serverCheck ? 'badge-synced' : 'badge-failed'">
          {{ serverCheck ? t('sync.reachable') : t('sync.unreachable') }}
        </span>
      </div>
    </div>

    <div class="card stack">
      <div class="row">
        <AppSelect v-model="filter" :options="filterOptions" :aria-label="t('sync.filter')" inline />
        <span class="muted small">{{ t('sync.records', { n: visible.length }) }}</span>
        <span class="spacer" />
        <button class="btn-small" @click="exportRows('csv')" :disabled="!visible.length">{{ t('common.exportCsv') }}</button>
        <button class="btn-small" @click="exportRows('json')" :disabled="!visible.length">{{ t('sync.exportJson') }}</button>
        <button class="btn-small" @click="prune">{{ t('sync.clearOld') }}</button>
      </div>

      <TransactionList :items="visible" show-event>
        <template #actions="{ item }">
          <div v-if="item.status === 'failed'" class="row">
            <button class="btn-small" @click="retry(item)">{{ t('common.retry') }}</button>
            <button class="btn-small" @click="startEdit(item)">{{ t('sync.editRetry') }}</button>
            <span class="muted small mono">{{ item.errorCode }} · {{ item.txnId.slice(0, 8) }}</span>
          </div>
          <form v-if="editing?.txnId === item.txnId" class="card stack edit" @submit.prevent="saveEdit">
            <div class="row">
              <strong>{{ t('sync.guest') }}</strong>
              <span v-if="editForm.guestId != null">{{ editForm.guestName }} <button type="button" class="btn-small" @click="editForm.guestId = null">{{ t('common.change') }}</button></span>
              <template v-else>
                <input v-model="editQuery" :placeholder="t('sync.searchGuest')" style="flex: 1; min-width: 160px" />
                <input v-model="editForm.walkInName" :placeholder="t('sync.walkInName')" style="flex: 1; min-width: 160px" />
              </template>
            </div>
            <div v-if="editForm.guestId == null && editResults.length" class="row">
              <button v-for="g in editResults" :key="g.id" type="button" class="btn-small" @click="Object.assign(editForm, { guestId: g.id, guestName: g.full_name })">
                {{ g.full_name }}
              </button>
            </div>
            <span class="field-error" v-if="editErrors.guest">{{ editErrors.guest }}</span>
            <div class="row">
              <label style="flex: 1">{{ t('sync.method') }}
                <AppSelect v-model="editForm.method" :options="methodOptions()" />
              </label>
              <label v-if="editForm.method === 'item'" style="flex: 2">{{ t('giftForm.itemLabel') }}
                <input v-model="editForm.item" maxlength="200" :placeholder="t('giftForm.itemPlaceholder')" />
              </label>
              <label v-else style="flex: 1">{{ t('sync.amount') }} <input v-model="editForm.amount" inputmode="decimal" /></label>
            </div>
            <span class="field-error" v-if="editErrors.amount">{{ editErrors.amount }}</span>
            <span class="field-error" v-if="editErrors.item">{{ editErrors.item }}</span>
            <label>{{ t('sync.note') }} <input v-model="editForm.note" maxlength="500" /></label>
            <div class="row">
              <button class="btn-primary btn-small">{{ t('sync.saveRetry') }}</button>
              <button type="button" class="btn-small" @click="editing = null">{{ t('common.cancel') }}</button>
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
