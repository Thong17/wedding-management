<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import AppTooltip from '@/components/AppTooltip.vue'
import type { GiftTransaction } from '@/offline/db'
import { useAuthStore } from '@/stores/auth'
import { formatDateTime, formatGiftValue, methodLabel } from '@/utils/format'

defineProps<{ items: GiftTransaction[]; showEvent?: boolean }>()
defineSlots<{ actions?: (props: { item: GiftTransaction }) => unknown }>()

const { t } = useI18n()
const auth = useAuthStore()
// Gifts sync between desks, so say who recorded each one ("you" for this login).
const recorder = (item: GiftTransaction) =>
  (item.recordedById != null && item.recordedById === auth.user?.id) || item.recordedBy === auth.user?.username
    ? t('txn.byYou')
    : t('txn.by', { name: item.recordedBy })
</script>

<template>
  <ul class="list">
    <li v-for="item in items" :key="item.txnId" class="item" :class="{ voided: item.voided }">
      <div class="row">
        <strong>{{ item.guestNameSnapshot }}</strong>
        <span v-if="item.guestId == null" class="badge badge-neutral">{{ t('common.walkIn') }}</span>
        <span class="spacer" />
        <span v-if="item.voided" class="badge badge-failed">{{ t('txn.voided') }}</span>
        <strong class="value" :class="{ nowrap: item.method !== 'item' }">{{ formatGiftValue(item) }}</strong>
      </div>
      <div class="row small muted">
        <span>{{ formatDateTime(item.createdAt) }} · {{ methodLabel(item.method) }}</span>
        <span v-if="item.recordedBy">· {{ recorder(item) }}</span>
        <span v-if="showEvent">· {{ t('txn.event', { id: item.eventId }) }}</span>
        <span v-if="item.note">· {{ item.note }}</span>
        <span class="spacer" />
        <AppTooltip :text="item.lastError">
          <span class="badge" :class="`badge-${item.status}`">{{ t(`status.${item.status}`) }}</span>
        </AppTooltip>
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
/* Voided on the server: still listed, but clearly not counted. */
.item.voided {
  background: color-mix(in srgb, var(--c-danger-soft) 55%, transparent);
  border-radius: 8px;
  padding-inline: 8px;
  margin-inline: -8px;
}
.item.voided .value { text-decoration: line-through; color: var(--c-muted); }
</style>
