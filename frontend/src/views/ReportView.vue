<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { eventsApi } from '@/api/endpoints'
import AppSelect from '@/components/AppSelect.vue'
import AppSkeleton from '@/components/AppSkeleton.vue'
import { errorMessage } from '@/api/http'
import type { EventReport } from '@/api/types'
import { countByStatus, type StatusCounts } from '@/offline/transactionRepo'
import { downloadFile, formatMoney, methodLabel, sideLabel } from '@/utils/format'

const props = defineProps<{ id: string }>()
const eventId = Number(props.id)
const { t } = useI18n()
const report = ref<EventReport | null>(null)
const error = ref<string | null>(null)
const local = ref<StatusCounts | null>(null)
const showOnly = ref<'all' | 'with' | 'without'>('all')
const showOptions = computed(() => [
  { value: 'all' as const, label: t('report.showAll') },
  { value: 'with' as const, label: t('report.showWith') },
  { value: 'without' as const, label: t('report.showWithout') },
])

/** Item gifts per guest id, e.g. { 12: ['Gold watch'] }. */
const itemsByGuest = computed(() => {
  const map = new Map<number, string[]>()
  for (const i of report.value?.items ?? []) {
    if (i.guest_id != null) map.set(i.guest_id, [...(map.get(i.guest_id) ?? []), i.item])
  }
  return map
})

const guests = computed(() => {
  const all = report.value?.by_guest ?? []
  if (showOnly.value === 'with') return all.filter((g) => g.gift_count)
  if (showOnly.value === 'without') return all.filter((g) => !g.gift_count)
  return all
})

onMounted(async () => {
  local.value = await countByStatus(eventId)
  try {
    report.value = await eventsApi.report(eventId)
  } catch (err) {
    error.value = errorMessage(err)
  }
})

function exportCsv() {
  if (!report.value) return
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`
  const lines = [[t('report.guest'), t('report.side'), t('report.group'), t('report.gifts'), t('report.totalCol'), t('report.itemsCol')].map(q).join(',')]
  for (const g of report.value.by_guest) {
    const items = (itemsByGuest.value.get(g.id) ?? []).join('; ')
    lines.push([q(g.full_name), q(sideLabel(g.side)), q(g.group), g.gift_count, g.gift_total ?? 0, q(items)].join(','))
  }
  // BOM so Excel opens UTF-8 (Khmer) text correctly.
  downloadFile(`report-event-${eventId}.csv`, '﻿' + lines.join('\n'), 'text/csv')
}
</script>

<template>
  <div class="container stack">
    <h1>{{ t('report.title') }}</h1>
    <div v-if="local && local.pending + local.syncing + local.failed > 0" class="banner banner-warn">
      {{ t('report.unsynced', { unsynced: local.pending + local.syncing, failed: local.failed }) }}
      <RouterLink to="/sync">{{ t('report.openSync') }}</RouterLink>
    </div>
    <div v-if="error" class="banner banner-danger">{{ error }} {{ t('report.needsConnection') }}</div>
    <div v-if="report" class="stack fade-in">
      <div class="card stats">
        <div class="stat"><span class="muted small">{{ t('report.total') }}</span><strong>{{ formatMoney(report.total, report.currency) }}</strong></div>
        <div class="stat"><span class="muted small">{{ t('report.gifts') }}</span><strong>{{ report.count }}</strong></div>
        <div class="stat"><span class="muted small">{{ t('report.guestsWhoGave') }}</span><strong>{{ report.guests_with_gift }} / {{ report.guests_total }}</strong></div>
        <div class="stat"><span class="muted small">{{ t('report.walkIn') }}</span><strong>{{ formatMoney(report.walk_in.total, report.currency) }}</strong></div>
        <div class="stat"><span class="muted small">{{ t('report.itemsReceived') }}</span><strong>{{ report.items.length }}</strong></div>
      </div>
      <div v-if="report.items.length" class="card stack">
        <h2>{{ t('report.itemsTitle') }}</h2>
        <ul class="list">
          <li v-for="(i, n) in report.items" :key="n" class="row" style="padding: 8px 0">
            <span>🎁 <strong>{{ i.item }}</strong></span>
            <span class="spacer" />
            <span class="muted small">{{ i.name }}<span v-if="i.guest_id == null" class="badge badge-neutral">{{ t('common.walkIn') }}</span></span>
          </li>
        </ul>
      </div>
      <div class="grid-2">
        <div class="card">
          <h2>{{ t('report.byMethod') }}</h2>
          <table><tbody>
            <tr v-for="m in report.by_method" :key="m.method"><td>{{ methodLabel(m.method) }}</td><td class="right">{{ m.count }}</td><td class="right">{{ m.method === 'item' ? '--' : formatMoney(m.total, report.currency) }}</td></tr>
          </tbody></table>
        </div>
        <div class="card">
          <h2>{{ t('report.bySide') }}</h2>
          <table><tbody>
            <tr v-for="s in report.by_side" :key="s.side"><td>{{ sideLabel(s.side) }}</td><td class="right">{{ s.count }}</td><td class="right">{{ formatMoney(s.total, report.currency) }}</td></tr>
          </tbody></table>
        </div>
      </div>
      <div class="card stack">
        <div class="row">
          <h2>{{ t('report.guests') }}</h2>
          <span class="spacer" />
          <AppSelect v-model="showOnly" :options="showOptions" :aria-label="t('report.show')" inline />
          <button class="btn-small" @click="exportCsv">{{ t('common.exportCsv') }}</button>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>{{ t('report.guest') }}</th><th>{{ t('report.side') }}</th><th>{{ t('report.group') }}</th><th class="right">{{ t('report.gifts') }}</th><th class="right">{{ t('report.totalCol') }}</th><th>{{ t('report.itemsCol') }}</th></tr></thead>
            <tbody>
              <tr v-for="g in guests" :key="g.id">
                <td>{{ g.full_name }}</td><td>{{ sideLabel(g.side) }}</td><td>{{ g.group }}</td>
                <td class="right">{{ g.gift_count }}</td><td class="right">{{ g.gift_total ? formatMoney(g.gift_total, report.currency) : '--' }}</td>
                <td class="small">{{ (itemsByGuest.get(g.id) ?? []).join(', ') }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
    <AppSkeleton v-else-if="!error" variant="page" />
  </div>
</template>
