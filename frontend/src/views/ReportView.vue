<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { eventsApi } from '@/api/endpoints'
import { errorMessage } from '@/api/http'
import type { EventReport } from '@/api/types'
import { countByStatus, type StatusCounts } from '@/offline/transactionRepo'
import { downloadFile, formatMoney, METHOD_LABELS, SIDE_LABELS } from '@/utils/format'

const props = defineProps<{ id: string }>()
const eventId = Number(props.id)
const report = ref<EventReport | null>(null)
const error = ref<string | null>(null)
const local = ref<StatusCounts | null>(null)
const showOnly = ref<'all' | 'with' | 'without'>('all')

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
  const lines = ['Guest,Side,Group,Gifts,Total']
  for (const g of report.value.by_guest) {
    lines.push([`"${g.full_name.replace(/"/g, '""')}"`, g.side, `"${g.group.replace(/"/g, '""')}"`, g.gift_count, g.gift_total ?? 0].join(','))
  }
  downloadFile(`report-event-${eventId}.csv`, lines.join('\n'), 'text/csv')
}
</script>

<template>
  <div class="container stack">
    <h1>Report</h1>
    <div v-if="local && local.pending + local.syncing + local.failed > 0" class="banner banner-warn">
      This device still has {{ local.pending + local.syncing }} unsynced and {{ local.failed }} failed gift(s) for this event that are not in these totals.
      <RouterLink to="/sync">Open sync center</RouterLink>
    </div>
    <div v-if="error" class="banner banner-danger">{{ error }} (Reports need a connection.)</div>
    <template v-if="report">
      <div class="card stats">
        <div class="stat"><span class="muted small">Total received</span><strong>{{ formatMoney(report.total, report.currency) }}</strong></div>
        <div class="stat"><span class="muted small">Gifts</span><strong>{{ report.count }}</strong></div>
        <div class="stat"><span class="muted small">Guests who gave</span><strong>{{ report.guests_with_gift }} / {{ report.guests_total }}</strong></div>
        <div class="stat"><span class="muted small">Walk-in gifts</span><strong>{{ formatMoney(report.walk_in.total, report.currency) }}</strong></div>
      </div>
      <div class="grid-2">
        <div class="card">
          <h2>By method</h2>
          <table><tbody>
            <tr v-for="m in report.by_method" :key="m.method"><td>{{ METHOD_LABELS[m.method] }}</td><td class="right">{{ m.count }}</td><td class="right">{{ formatMoney(m.total, report.currency) }}</td></tr>
          </tbody></table>
        </div>
        <div class="card">
          <h2>By side</h2>
          <table><tbody>
            <tr v-for="s in report.by_side" :key="s.side"><td>{{ SIDE_LABELS[s.side] }}</td><td class="right">{{ s.count }}</td><td class="right">{{ formatMoney(s.total, report.currency) }}</td></tr>
          </tbody></table>
        </div>
      </div>
      <div class="card stack">
        <div class="row">
          <h2>Guests</h2>
          <span class="spacer" />
          <select v-model="showOnly" style="width: auto">
            <option value="all">All guests</option><option value="with">Gave a gift</option><option value="without">No gift yet</option>
          </select>
          <button class="btn-small" @click="exportCsv">Export CSV</button>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Guest</th><th>Side</th><th>Group</th><th class="right">Gifts</th><th class="right">Total</th></tr></thead>
            <tbody>
              <tr v-for="g in guests" :key="g.id">
                <td>{{ g.full_name }}</td><td>{{ SIDE_LABELS[g.side] }}</td><td>{{ g.group }}</td>
                <td class="right">{{ g.gift_count }}</td><td class="right">{{ g.gift_total ? formatMoney(g.gift_total, report.currency) : '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>
