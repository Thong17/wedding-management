<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import type { InviteLabels } from '@/invite/labels'

/**
 * A bank QR code for gifts, opened from the invitation: its account name in large type, the code, a
 * reminder to check that name in the banking app before sending, and Save to device.
 *
 * Shown over the whole invitation (InvitationView), never inside the card: the card animates, and a
 * dialog inside it would be placed against the card and move with it. No background blur either: the
 * golden particles behind keep moving, and blurring them on every frame makes the screen flicker.
 *
 * Saving: on phones the share sheet (its "Save Image" puts the code in Photos); elsewhere a download;
 * if the picture can't be fetched, it opens in a new tab to save from there.
 */
const props = defineProps<{ qr: { url: string; label: string } | null; labels: InviteLabels; textFont: string }>()
const emit = defineEmits<{ close: [] }>()

const dialog = ref<HTMLElement | null>(null)
const saveState = ref<'idle' | 'saving' | 'saved'>('idle')
watch(
  () => props.qr,
  async (qr) => {
    saveState.value = 'idle'
    if (!qr) return
    await nextTick()
    dialog.value?.focus()
  },
)

async function save() {
  const qr = props.qr
  if (!qr) return
  saveState.value = 'saving'
  const name = `${(qr.label || 'bank-qr').replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'bank-qr'}.png`
  try {
    const blob = await (await fetch(qr.url)).blob()
    const file = new File([blob], name, { type: blob.type || 'image/png' })
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: qr.label || props.labels.gift })
    } else {
      const link = document.createElement('a')
      link.href = URL.createObjectURL(file)
      link.download = name
      link.click()
      setTimeout(() => URL.revokeObjectURL(link.href), 10_000)
    }
    saveState.value = 'saved'
  } catch (err) {
    saveState.value = 'idle'
    // The guest closed the share sheet: nothing to do. Anything else: let them save it themselves.
    if ((err as Error)?.name !== 'AbortError') window.open(qr.url, '_blank', 'noopener')
  }
}
</script>

<template>
  <Transition name="qr-dialog">
    <div v-if="qr" class="qr-backdrop" @click.self="emit('close')" @keydown.esc="emit('close')">
      <div ref="dialog" class="qr-dialog" :style="{ fontFamily: textFont }" role="dialog" aria-modal="true" aria-labelledby="qr-dialog-name" tabindex="-1">
        <p class="small-caps">{{ labels.gift }}</p>
        <h2 id="qr-dialog-name" class="qr-name">{{ qr.label || labels.gift }}</h2>
        <div class="qr-image"><img :src="qr.url" :alt="qr.label || labels.gift" /></div>
        <p class="qr-note" role="note">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16.5h.01" /></svg>
          <span>{{ qr.label ? labels.checkName.replace('{name}', qr.label) : labels.checkNameGeneric }}</span>
        </p>
        <div class="qr-actions">
          <button type="button" class="qr-btn primary" :disabled="saveState === 'saving'" @click="save">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M4 21h16" /></svg>
            {{ saveState === 'saving' ? labels.saving : saveState === 'saved' ? labels.saved : labels.saveToDevice }}
          </button>
          <button type="button" class="qr-btn" @click="emit('close')">{{ labels.close }}</button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* A paper card over the dimmed invitation; on narrow screens a sheet from the bottom. */
.qr-backdrop {
  position: absolute;
  inset: 0;
  z-index: 8;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgb(20 8 12 / 0.62);
}
.qr-dialog {
  width: min(100%, 380px);
  max-height: calc(100% - 16px);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 22px 20px 18px;
  border-radius: 18px;
  background: var(--paper);
  color: var(--ink);
  border: 1px solid color-mix(in srgb, var(--gold) 60%, transparent);
  box-shadow: 0 24px 60px rgb(0 0 0 / 0.35);
  text-align: center;
  outline: none;
}
.qr-name { margin: 0; font-size: 1.35rem; font-weight: 700; line-height: 1.3; overflow-wrap: anywhere; }
.qr-image { width: min(100%, 280px); padding: 12px; border-radius: 14px; background: #fff; border: 1px solid color-mix(in srgb, var(--gold) 45%, transparent); }
.qr-image img { display: block; width: 100%; aspect-ratio: 1; object-fit: contain; }
.qr-note {
  margin: 0;
  display: flex;
  gap: 8px;
  align-items: flex-start;
  text-align: left;
  font-size: 0.9em;
  line-height: 1.5;
  padding: 10px 12px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--gold) 14%, transparent);
  border: 1px solid color-mix(in srgb, var(--gold) 45%, transparent);
}
.qr-note svg { width: 18px; height: 18px; flex-shrink: 0; margin-top: 2px; fill: none; stroke: var(--gold); stroke-width: 2; stroke-linecap: round; }
.qr-actions { display: flex; flex-direction: column; gap: 8px; width: 100%; }
.qr-btn {
  font: inherit;
  font-weight: 600;
  min-height: 46px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--gold) 70%, transparent);
  background: transparent;
  color: var(--ink);
  cursor: pointer;
}
.qr-btn.primary { background: var(--ink); color: var(--paper); border-color: var(--ink); }
.qr-btn:disabled { opacity: 0.7; cursor: progress; }
.qr-btn svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.qr-dialog-enter-active, .qr-dialog-leave-active { transition: opacity 0.25s ease; }
.qr-dialog-enter-active .qr-dialog { transition: transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1); }
.qr-dialog-enter-from, .qr-dialog-leave-to { opacity: 0; }
.qr-dialog-enter-from .qr-dialog { transform: translateY(16px) scale(0.97); }
@container invite (max-width: 520px) {
  .qr-backdrop { align-items: flex-end; padding: 0; }
  .qr-dialog { width: 100%; border-radius: 18px 18px 0 0; padding-bottom: calc(18px + env(safe-area-inset-bottom)); }
  .qr-dialog-enter-from .qr-dialog { transform: translateY(100%); }
}
.small-caps { font-size: 0.75em; letter-spacing: 0.22em; text-transform: uppercase; color: var(--gold); font-weight: 600; margin: 0; }
.small-caps:lang(km) { letter-spacing: 0.02em; text-transform: none; }
@media (prefers-reduced-motion: reduce) {
  .qr-dialog-enter-active, .qr-dialog-leave-active, .qr-dialog-enter-active .qr-dialog { transition: none; }
}
</style>
