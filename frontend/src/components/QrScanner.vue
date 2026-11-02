<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Html5Qrcode } from 'html5-qrcode'

const { t } = useI18n()

const emit = defineEmits<{ scan: [text: string] }>()
const regionId = `qr-region-${Math.random().toString(36).slice(2)}`
const running = ref(false)
const starting = ref(false)
const error = ref<string | null>(null)
let scanner: Html5Qrcode | null = null

async function start() {
  error.value = null
  // Show the region before starting: html5-qrcode sizes the preview from the
  // container's width, which is 0 while it is hidden.
  starting.value = true
  await nextTick()
  try {
    const { Html5Qrcode, Html5QrcodeSupportedFormats: F } = await import('html5-qrcode')
    scanner = new Html5Qrcode(regionId, {
      verbose: false,
      formatsToSupport: [F.QR_CODE, F.CODE_128, F.CODE_39, F.EAN_13, F.DATA_MATRIX],
    })
    await scanner.start(
      { facingMode: 'environment' },
      {
        fps: 10,
        qrbox: (w, h) => {
          const size = Math.max(150, Math.floor(Math.min(w, h) * 0.7))
          return { width: size, height: size }
        },
      },
      (text) => {
        emit('scan', text)
        void stop()
      },
      () => {},
    )
    running.value = true
  } catch (err) {
    error.value = t('qr.unavailable', { error: err instanceof Error ? err.message : String(err) })
    running.value = false
  } finally {
    starting.value = false
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
    <div :id="regionId" class="region" v-show="running || starting" />
    <p v-if="starting" class="muted small">{{ t('qr.starting') }}</p>
    <div class="row">
      <button v-if="!running" class="btn-primary" :disabled="starting" @click="start">{{ t('qr.start') }}</button>
      <button v-else @click="stop">{{ t('qr.stop') }}</button>
      <span class="muted small">{{ t('qr.hint') }}</span>
    </div>
    <p v-if="error" class="banner banner-danger small">{{ error }}</p>
  </div>
</template>

<style scoped>
.region { width: 100%; max-width: 420px; min-height: 240px; border-radius: var(--radius-md); overflow: hidden; background: #000; }
.region :deep(video) { width: 100% !important; height: auto !important; display: block; object-fit: cover; }
</style>
