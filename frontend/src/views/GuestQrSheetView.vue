<script setup lang="ts">
import QRCode from 'qrcode'
import { onMounted, ref } from 'vue'
import { errorMessage } from '@/api/http'
import { guestsApi } from '@/api/endpoints'
import type { ApiGuest } from '@/api/types'
import { qrPayloadForGuest } from '@/offline/guestSearch'

const props = defineProps<{ id: string }>()
const eventId = Number(props.id)
const items = ref<{ guest: ApiGuest; svg: string }[]>([])
const error = ref<string | null>(null)
const print = () => window.print()

onMounted(async () => {
  try {
    const { results } = await guestsApi.list(eventId)
    items.value = await Promise.all(
      results.map(async (guest) => ({
        guest,
        svg: await QRCode.toString(qrPayloadForGuest(guest), { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }),
      })),
    )
  } catch (err) {
    error.value = errorMessage(err)
  }
})
</script>

<template>
  <div class="container stack">
    <div class="row no-print">
      <h1>Guest QR codes</h1>
      <span class="spacer" />
      <button class="btn-primary" @click="print">Print</button>
    </div>
    <p class="muted small no-print">Print these and attach them to invitations. Scanning one at the gift desk selects the guest instantly, even offline.</p>
    <div v-if="error" class="banner banner-danger">{{ error }}</div>
    <div class="sheet">
      <div v-for="i in items" :key="i.guest.id" class="tag">
        <div class="qr" v-html="i.svg" />
        <strong>{{ i.guest.full_name }}</strong>
        <span class="small muted" v-if="i.guest.table_no">Table {{ i.guest.table_no }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sheet { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; }
.tag { border: 1px dashed var(--c-border); border-radius: var(--radius-md); padding: 10px; text-align: center; display: flex; flex-direction: column; align-items: center; break-inside: avoid; background: #fff; color: #000; }
.qr { width: 130px; height: 130px; }
.qr :deep(svg) { width: 100%; height: 100%; }
</style>
