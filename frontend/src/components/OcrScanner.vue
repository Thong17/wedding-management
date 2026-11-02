<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref } from 'vue'
import { ocrCandidateLines } from '@/offline/guestSearch'

const emit = defineEmits<{ text: [text: string] }>()
const busy = ref(false)
const progress = ref(0)
const lines = ref<string[]>([])
const error = ref<string | null>(null)
const preview = ref<string | null>(null)
const cameraOn = ref(false)
const video = ref<HTMLVideoElement | null>(null)
const langs = import.meta.env.VITE_OCR_LANGS || 'eng'
let stream: MediaStream | null = null

async function startCamera() {
  error.value = null
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    })
    cameraOn.value = true
    await nextTick()
    if (video.value) {
      video.value.srcObject = stream
      await video.value.play()
    }
  } catch (err) {
    stopCamera()
    error.value = `Camera unavailable: ${err instanceof Error ? err.message : String(err)}. Camera access needs HTTPS (or localhost) and permission. You can still use "Photo / upload".`
  }
}

function stopCamera() {
  stream?.getTracks().forEach((t) => t.stop())
  stream = null
  cameraOn.value = false
}

async function capture() {
  const v = video.value
  if (!v || !v.videoWidth) return
  // Crop to the on-screen guide box (with a little margin) so stray text
  // around the name doesn't clutter the OCR results.
  const sx = Math.round(v.videoWidth * 0.05)
  const sy = Math.round(v.videoHeight * 0.3)
  const sw = v.videoWidth - 2 * sx
  const sh = v.videoHeight - 2 * sy
  const canvas = document.createElement('canvas')
  canvas.width = sw
  canvas.height = sh
  canvas.getContext('2d')!.drawImage(v, sx, sy, sw, sh, 0, 0, sw, sh)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92))
  if (!blob) return
  stopCamera()
  await recognize(blob)
}

async function onFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (!file) return
  stopCamera()
  await recognize(file)
}

async function recognize(image: Blob) {
  busy.value = true
  error.value = null
  lines.value = []
  progress.value = 0
  if (preview.value) URL.revokeObjectURL(preview.value)
  preview.value = URL.createObjectURL(image)
  try {
    // Loaded on demand: the OCR engine is large and only needed here.
    const { createWorker } = await import('tesseract.js')
    const worker = await createWorker(langs, 1, {
      logger: (m: { status: string; progress: number }) => {
        if (m.status === 'recognizing text') progress.value = Math.round(m.progress * 100)
      },
    })
    try {
      const { data } = await worker.recognize(image)
      lines.value = ocrCandidateLines(data.text)
      if (!lines.value.length) error.value = 'No readable text found. Try a closer, well-lit photo of the name.'
    } finally {
      await worker.terminate()
    }
  } catch (err) {
    error.value = `Text scanning failed: ${err instanceof Error ? err.message : String(err)}. The OCR engine is downloaded the first time it is used, so open it once while online.`
  } finally {
    busy.value = false
  }
}

onBeforeUnmount(() => {
  stopCamera()
  if (preview.value) URL.revokeObjectURL(preview.value)
})
</script>

<template>
  <div class="stack">
    <div v-if="cameraOn" class="camera">
      <video ref="video" playsinline muted />
      <div class="guide" />
    </div>
    <div class="row">
      <template v-if="cameraOn">
        <button class="btn-primary" :disabled="busy" @click="capture">📸 Capture</button>
        <button @click="stopCamera">Stop camera</button>
      </template>
      <button v-else class="btn-primary" :disabled="busy" @click="startCamera">📷 Start camera</button>
      <label class="btn file-btn" :class="{ disabled: busy }">
        🖼️ Photo / upload
        <input type="file" accept="image/*" capture="environment" @change="onFile" :disabled="busy" hidden />
      </label>
    </div>
    <span v-if="cameraOn" class="muted small">Fit the guest's name inside the box, then tap Capture.</span>
    <img v-if="preview && !cameraOn" :src="preview" alt="Scanned card" class="preview" />
    <p v-if="busy" class="muted small">Reading text… {{ progress }}%</p>
    <p v-if="error" class="banner banner-warn small">{{ error }}</p>
    <div v-if="lines.length" class="stack">
      <span class="muted small">Tap the line with the guest's name:</span>
      <div class="row">
        <button v-for="l in lines" :key="l" class="btn-small" @click="emit('text', l)">{{ l }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.file-btn { cursor: pointer; flex-direction: row; }
.file-btn.disabled { opacity: 0.5; pointer-events: none; }
.preview { max-width: 100%; max-height: 200px; object-fit: contain; border-radius: var(--radius-md); align-self: flex-start; }
.camera { position: relative; width: 100%; max-width: 420px; border-radius: var(--radius-md); overflow: hidden; background: #000; }
.camera video { width: 100%; display: block; }
.guide {
  position: absolute; left: 10%; right: 10%; top: 35%; bottom: 35%;
  border: 2px dashed rgba(255, 255, 255, 0.85); border-radius: var(--radius-sm);
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.35);
  pointer-events: none;
}
</style>
