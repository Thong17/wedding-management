<script setup lang="ts">
import type { GiftTransaction } from '@/offline/db'
import { formatDateTime, formatMoney, METHOD_LABELS } from '@/utils/format'

defineProps<{ items: GiftTransaction[]; showEvent?: boolean }>()
defineSlots<{ actions?: (props: { item: GiftTransaction }) => unknown }>()

const LABELS: Record<GiftTransaction['status'], string> = {
  pending: 'Saved locally',
  syncing: 'Uploading…',
  synced: 'Synced',
  failed: 'Failed',
}
</script>

<template>
  <ul class="list">
    <li v-for="t in items" :key="t.txnId" class="item">
      <div class="row">
        <strong>{{ t.guestNameSnapshot }}</strong>
        <span v-if="t.guestId == null" class="badge badge-neutral">walk-in</span>
        <span class="spacer" />
        <strong class="nowrap">{{ formatMoney(t.amount, t.currency) }}</strong>
      </div>
      <div class="row small muted">
        <span>{{ formatDateTime(t.createdAt) }} · {{ METHOD_LABELS[t.method] }}</span>
        <span v-if="showEvent">· event #{{ t.eventId }}</span>
        <span v-if="t.note">· {{ t.note }}</span>
        <span class="spacer" />
        <span class="badge" :class="`badge-${t.status}`" :title="t.lastError ?? ''">{{ LABELS[t.status] }}</span>
      </div>
      <div v-if="t.status === 'failed' || (t.status === 'pending' && t.lastError)" class="small" :class="t.status === 'failed' ? 'field-error' : 'muted'">
        {{ t.status === 'failed' ? '⚠ ' : 'Last attempt: ' }}{{ t.lastError }}
        <span v-if="t.attempts" class="muted">({{ t.attempts }} attempt{{ t.attempts > 1 ? 's' : '' }})</span>
      </div>
      <slot name="actions" :item="t" />
    </li>
    <li v-if="!items.length" class="muted small item">Nothing here.</li>
  </ul>
</template>

<style scoped>
.item { padding: 10px 0; display: flex; flex-direction: column; gap: 4px; }
</style>
