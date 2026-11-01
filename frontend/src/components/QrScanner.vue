<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import type { Html5Qrcode } from 'html5-qrcode'

const emit = defineEmits<{ scan: [text: string] }>()
const regionId = `qr-region-${Math.random().toString(36).slice(2)}`
const running = ref(false)
const error = ref<string | null>(null)
let scanner: Html5Qrcode | null = null

async function start() {
  error.value = null
  try {
    const { Html5Qrcode, Html5QrcodeSupportedFormats: F } = await import('html5-qrcode')
    scanner = new Html5Qrcode(regionId, {
      verbose: false,
      formatsToSupport: [F.QR_CODE, F.CODE_128, F.CODE_39, F.EAN_13, F.DATA_MATRIX],
    })
    await scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: (w, h) => ({ width: Math.min(w, h) * 0.7, height: Math.min(w, h) * 0.7 }) },
      (text) => {
        emit('scan', text)
        void stop()
      },
      () => {},
    )
    running.value = true
  } catch (err) {
    error.value = `Camera unavailable: ${err instanceof Error ? err.message : String(err)}. Camera access needs HTTPS (or localhost) and permission.`
    running.value = false
  }
}

async function stop() {
  if (scanner && running.value) {
    try {
      await scanner.stop()
      scanner.clear()
    } catch {
      /* already stopped */
    }
  }
  running.value = false
}

onBeforeUnmount(stop)
</script>

<template>
  <div class="stack">
    <div :id="regionId" class="region" v-show="running" />
    <div class="row">
      <button v-if="!running" class="btn-primary" @click="start">📷 Start camera</button>
      <button v-else @click="stop">Stop camera</button>
      <span class="muted small">Scan the guest's invitation QR code or barcode.</span>
    </div>
    <p v-if="error" class="banner banner-danger small">{{ error }}</p>
  </div>
</template>

<style scoped>
.region { width: 100%; max-width: 420px; border-radius: 8px; overflow: hidden; }
</style>
