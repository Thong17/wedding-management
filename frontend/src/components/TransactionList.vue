<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { GiftTransaction } from '@/offline/db'
import { formatDateTime, formatGiftValue, methodLabel } from '@/utils/format'

defineProps<{ items: GiftTransaction[]; showEvent?: boolean }>()
defineSlots<{ actions?: (props: { item: GiftTransaction }) => unknown }>()

const { t } = useI18n()
</script>

<template>
  <ul class="list">
    <li v-for="item in items" :key="item.txnId" class="item">
      <div class="row">
        <strong>{{ item.guestNameSnapshot }}</strong>
        <span v-if="item.guestId == null" class="badge badge-neutral">{{ t('common.walkIn') }}</span>
        <span class="spacer" />
        <strong :class="{ nowrap: item.method !== 'item' }">{{ formatGiftValue(item) }}</strong>
      </div>
      <div class="row small muted">
        <span>{{ formatDateTime(item.createdAt) }} · {{ methodLabel(item.method) }}</span>
        <span v-if="showEvent">· {{ t('txn.event', { id: item.eventId }) }}</span>
        <span v-if="item.note">· {{ item.note }}</span>
        <span class="spacer" />
        <span class="badge" :class="`badge-${item.status}`" :title="item.lastError ?? ''">{{ t(`status.${item.status}`) }}</span>
      </div>
      <div v-if="item.status === 'failed' || (item.status === 'pending' && item.lastError)" class="small" :class="item.status === 'failed' ? 'field-error' : 'muted'">
        {{ item.status === 'failed' ? `⚠ ${item.lastError}` : t('txn.lastAttempt', { error: item.lastError }) }}
        <span v-if="item.attempts" class="muted">{{ t('txn.attempts', item.attempts) }}</span>
      </div>
      <slot name="actions" :item="item" />
    </li>
    <li v-if="!items.length" class="muted small item">{{ t('common.nothing') }}</li>
  </ul>
</template>

<style scoped>
.item { padding: 10px 0; display: flex; flex-direction: column; gap: 4px; }
</style>
