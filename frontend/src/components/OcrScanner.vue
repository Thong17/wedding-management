<script setup lang="ts">
import { ref } from 'vue'
import { ocrCandidateLines } from '@/offline/guestSearch'

const emit = defineEmits<{ text: [text: string] }>()
const busy = ref(false)
const progress = ref(0)
const lines = ref<string[]>([])
const error = ref<string | null>(null)
const preview = ref<string | null>(null)
const langs = import.meta.env.VITE_OCR_LANGS || 'eng'

async function onFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (!file) return
  busy.value = true
  error.value = null
  lines.value = []
  progress.value = 0
  if (preview.value) URL.revokeObjectURL(preview.value)
  preview.value = URL.createObjectURL(file)
  try {
    // Loaded on demand: the OCR engine is large and only needed here.
    const { createWorker } = await import('tesseract.js')
    const worker = await createWorker(langs, 1, {
      logger: (m: { status: string; progress: number }) => {
        if (m.status === 'recognizing text') progress.value = Math.round(m.progress * 100)
      },
    })
    try {
      const { data } = await worker.recognize(file)
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
</script>

<template>
  <div class="stack">
    <label class="btn btn-primary file-btn">
      📝 Photograph name on card
      <input type="file" accept="image/*" capture="environment" @change="onFile" :disabled="busy" hidden />
    </label>
    <img v-if="preview" :src="preview" alt="Scanned card" class="preview" />
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
.file-btn { cursor: pointer; align-self: flex-start; flex-direction: row; }
.preview { max-width: 100%; max-height: 200px; object-fit: contain; border-radius: 8px; align-self: flex-start; }
</style>
