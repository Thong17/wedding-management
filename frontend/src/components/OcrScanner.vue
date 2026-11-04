<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/AppIcon.vue'
import type { CachedGuest } from '@/offline/db'
import { guestsLikeOcrLines, pickMiddleText, type GuestSearcher, type MiddleText } from '@/offline/guestSearch'
import { sideLabel } from '@/utils/format'
import { prepareForOcr, TARGET_LONG_SIDE } from '@/utils/ocrImage'

const { t } = useI18n()

const props = defineProps<{ searcher: GuestSearcher; giftedGuestIds: Set<number | null> }>()
const emit = defineEmits<{
  /** A guest on the list was picked. */
  select: [guest: CachedGuest]
  /** Text that matches no guest was picked: use it as a walk-in (new guest) name. */
  walkIn: [name: string]
}>()
const busy = ref(false)
const progress = ref(0)
// Only the text in the middle of the image (where the name is); the rest of the card is ignored.
const lines = ref<string[]>([])
// OCR misreads letters, so also offer the guests whose names are closest to what was read.
const similarGuests = computed(() => guestsLikeOcrLines(lines.value, props.searcher))
const readLines = computed(() => lines.value.map((text) => ({ text, guest: props.searcher.findExact(text) })))

function pickLine(line: { text: string; guest?: CachedGuest }) {
  if (line.guest) emit('select', line.guest)
  else emit('walkIn', line.text)
}
const error = ref<string | null>(null)
const preview = ref<string | null>(null)
const cameraOn = ref(false)
const video = ref<HTMLVideoElement | null>(null)
// Khmer first: it's the main script on Cambodian invitations; English covers Latin names.
const langs = import.meta.env.VITE_OCR_LANGS || 'khm+eng'
let stream: MediaStream | null = null

type OcrWorker = Awaited<ReturnType<typeof import('tesseract.js')['createWorker']>>
// One engine for as long as the scanner is open: loading the Khmer model is the slow part.
let workerPromise: Promise<OcrWorker> | null = null
function getWorker(): Promise<OcrWorker> {
  workerPromise ??= (async () => {
    // Loaded on demand: the OCR engine is large and only needed here.
    const { createWorker } = await import('tesseract.js')
    return createWorker(langs, 1, {
      logger: (m: { status: string; progress: number }) => {
        if (m.status === 'recognizing text') progress.value = Math.round(m.progress * 100)
      },
    })
  })()
  workerPromise.catch(() => (workerPromise = null)) // allow a retry, e.g. after coming back online
  return workerPromise
}

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
    error.value = t('ocr.cameraUnavailable', { error: err instanceof Error ? err.message : String(err) })
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
  // The guide box holds one name (maybe over two lines): read it as one block of text.
  await recognize(blob, 'block')
}

async function onFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (!file) return
  stopCamera()
  // A whole card or photo: let the engine find the text blocks itself.
  await recognize(file, 'auto')
}

/** Tesseract page segmentation: 6 = one uniform block of text, 3 = find the layout automatically. */
const PAGE_MODES = { block: '6', auto: '3' } as const
/** Read a second time when the engine is less sure than this (0–100) of the middle text. */
const RETRY_BELOW = 60

async function readMiddle(worker: OcrWorker, image: Blob, longSide: number): Promise<MiddleText> {
  const prepared = await prepareForOcr(image, longSide)
  const { canvas } = prepared
  const { data } = await worker.recognize(canvas)
  // Ink colour per line and per word, so text in another colour can be told apart from the name.
  const found = data.lines.map((l) => ({
    ...l,
    color: prepared.textColor(l.bbox),
    words: l.words.map((w) => ({ ...w, color: prepared.textColor(w.bbox) })),
  }))
  const middle = pickMiddleText(found, canvas.width, canvas.height)
  return middle.lines.length ? middle : { lines: [], confidence: 0 }
}

async function recognize(image: Blob, layout: keyof typeof PAGE_MODES) {
  busy.value = true
  error.value = null
  lines.value = []
  progress.value = 0
  if (preview.value) URL.revokeObjectURL(preview.value)
  preview.value = URL.createObjectURL(image)
  try {
    const worker = await getWorker()
    await worker.setParameters({
      tessedit_pageseg_mode: PAGE_MODES[layout] as never,
      // Keep the spaces between name parts (Khmer writes no spaces inside a name).
      preserve_interword_spaces: '1',
    })
    let best = await readMiddle(worker, image, TARGET_LONG_SIDE)
    // Handwriting especially reads well at one size and not at another: if the first try found
    // nothing or the engine is unsure, read again smaller and keep whichever it is surer of.
    if (best.confidence < RETRY_BELOW) {
      progress.value = 0
      const second = await readMiddle(worker, image, Math.round(TARGET_LONG_SIDE * 0.7))
      if (second.confidence > best.confidence) best = second
    }
    lines.value = best.lines
    if (!lines.value.length) error.value = t('ocr.noText')
  } catch (err) {
    error.value = t('ocr.failed', { error: err instanceof Error ? err.message : String(err) })
  } finally {
    busy.value = false
  }
}

onBeforeUnmount(() => {
  stopCamera()
  if (preview.value) URL.revokeObjectURL(preview.value)
  // Free the OCR engine's memory when the scanner closes.
  void workerPromise?.then((w) => w.terminate()).catch(() => {})
  workerPromise = null
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
        <button class="btn-primary" :disabled="busy" @click="capture">{{ t('ocr.capture') }}</button>
        <button @click="stopCamera">{{ t('ocr.stopCamera') }}</button>
      </template>
      <button v-else class="btn-primary" :disabled="busy" @click="startCamera">{{ t('ocr.startCamera') }}</button>
      <label class="btn file-btn" :class="{ disabled: busy }">
        {{ t('ocr.upload') }}
        <input type="file" accept="image/*" capture="environment" @change="onFile" :disabled="busy" hidden />
      </label>
    </div>
    <span v-if="cameraOn" class="muted small">{{ t('ocr.fitHint') }}</span>
    <img v-if="preview && !cameraOn" :src="preview" :alt="t('ocr.scannedAlt')" class="preview" />
    <p v-if="busy" class="muted small">{{ t('ocr.reading', { n: progress }) }}</p>
    <p v-if="error" class="banner banner-warn small">{{ error }}</p>
    <div v-if="lines.length" class="stack">
      <span class="muted small">{{ t('ocr.similarGuests') }}</span>
      <ul class="list matches">
        <li v-for="g in similarGuests" :key="g.id" :title="t('ocr.onList')" @click="emit('select', g)">
          <AppIcon name="check" :size="16" class="on-list" />
          <div class="grow">
            <strong>{{ g.full_name }}</strong>
            <span v-if="g.nickname" class="muted small"> “{{ g.nickname }}”</span>
            <div class="muted small">
              {{ sideLabel(g.side) }}<span v-if="g.group"> · {{ g.group }}</span><span v-if="g.table_no"> · {{ t('common.table', { n: g.table_no }) }}</span>
            </div>
          </div>
          <span v-if="giftedGuestIds.has(g.id)" class="badge badge-synced" :title="t('search.giftedTitle')">{{ t('search.gifted') }}</span>
        </li>
        <li v-if="!similarGuests.length" class="muted small empty">{{ t('ocr.noSimilar') }}</li>
      </ul>

      <span class="muted small">{{ t('ocr.readText') }}</span>
      <div class="row">
        <button
          v-for="l in readLines"
          :key="l.text"
          class="btn-small read-line"
          :title="l.guest ? t('ocr.onList') : t('ocr.useAsWalkIn')"
          @click="pickLine(l)"
        >
          <AppIcon :name="l.guest ? 'check' : 'plus'" :size="14" :class="l.guest ? 'on-list' : 'not-on-list'" />
          {{ l.text }}
        </button>
      </div>
      <span class="muted small">{{ t('ocr.legend') }}</span>
    </div>
  </div>
</template>

<style scoped>
.file-btn { cursor: pointer; flex-direction: row; }
.matches { border: 1px solid var(--c-border); border-radius: var(--radius-md); overflow: hidden; }
.matches li { display: flex; align-items: center; gap: 10px; padding: 10px 12px; cursor: pointer; }
.matches li:hover { background: var(--c-primary-soft); }
.matches li.empty { cursor: default; }
.matches li.empty:hover { background: none; }
.matches .grow { flex: 1; min-width: 0; }
.on-list { color: var(--c-ok); flex-shrink: 0; }
.not-on-list { opacity: 0.7; flex-shrink: 0; }
.read-line { display: inline-flex; align-items: center; gap: 6px; }
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
