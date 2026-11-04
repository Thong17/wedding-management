<script setup lang="ts">
import { DialogClose, DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/AppIcon.vue'

/**
 * A modal dialog for create / edit forms. Focus is trapped inside, Escape and the close button
 * dismiss it, and it becomes a full-width sheet on phones. Put the form (with its own buttons) in the slot.
 */
const open = defineModel<boolean>('open', { required: true })
withDefaults(defineProps<{ title: string; description?: string; size?: 'sm' | 'md' | 'lg' }>(), { size: 'md' })
const { t } = useI18n()
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogOverlay class="dialog-overlay" />
      <!-- Without a description, tell Reka there is none (it links one automatically when present). -->
      <DialogContent class="dialog" :class="`dialog-${size}`" v-bind="description ? {} : { 'aria-describedby': undefined }">
        <div class="dialog-head">
          <DialogTitle class="dialog-title">{{ title }}</DialogTitle>
          <DialogClose class="btn-icon dialog-close" :aria-label="t('common.close')"><AppIcon name="x" /></DialogClose>
        </div>
        <DialogDescription v-if="description" class="muted small dialog-desc">{{ description }}</DialogDescription>
        <div class="dialog-body"><slot /></div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style>
/* Unscoped: the dialog is portalled to <body>. Above the header and sidebar, below toasts. */
.dialog-overlay { position: fixed; inset: 0; z-index: 35; background: rgb(0 0 0 / 0.45); }
.dialog {
  position: fixed;
  z-index: 36;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: calc(100vw - 32px);
  max-height: calc(100vh - 32px);
  overflow-y: auto;
  padding: 20px;
  background: var(--c-surface);
  color: var(--c-text);
  border: 1px solid var(--c-border);
  border-radius: var(--radius);
  box-shadow: 0 16px 48px rgb(0 0 0 / 0.25);
}
.dialog:focus { outline: none; }
.dialog-sm { max-width: 440px; }
.dialog-md { max-width: 620px; }
.dialog-lg { max-width: 860px; }
.dialog-head { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.dialog-title { margin: 0; font-size: 1.2rem; flex: 1; min-width: 0; overflow-wrap: anywhere; }
.dialog-close { width: 36px; min-height: 36px; height: 36px; flex-shrink: 0; border-radius: 50%; corner-shape: round; }
.dialog-desc { margin: -4px 0 12px; }

/* Open/close animations. Reka sets data-state and waits for the closing animation before removing. */
.dialog-overlay[data-state='open'] { animation: dialog-fade-in 200ms ease-out; }
.dialog-overlay[data-state='closed'] { animation: dialog-fade-out 160ms ease-in forwards; }
.dialog[data-state='open'] { animation: dialog-pop-in 220ms cubic-bezier(0.16, 1, 0.3, 1); }
.dialog[data-state='closed'] { animation: dialog-pop-out 160ms ease-in forwards; }
@keyframes dialog-fade-in { from { opacity: 0; } }
@keyframes dialog-fade-out { to { opacity: 0; } }
@keyframes dialog-pop-in {
  from { opacity: 0; transform: translate(-50%, -46%) scale(0.96); }
}
@keyframes dialog-pop-out {
  to { opacity: 0; transform: translate(-50%, -48%) scale(0.97); }
}

/* Phones: a sheet from the bottom, full width, that slides up. */
@media (max-width: 599px) {
  .dialog {
    top: auto;
    bottom: 0;
    transform: translateX(-50%);
    width: 100vw;
    max-width: none;
    max-height: 92vh;
    border-radius: var(--radius) var(--radius) 0 0;
    padding-bottom: calc(20px + env(safe-area-inset-bottom));
  }
  .dialog[data-state='open'] { animation: dialog-sheet-in 280ms cubic-bezier(0.16, 1, 0.3, 1); }
  .dialog[data-state='closed'] { animation: dialog-sheet-out 200ms ease-in forwards; }
}
@keyframes dialog-sheet-in {
  from { transform: translate(-50%, 100%); }
}
@keyframes dialog-sheet-out {
  to { transform: translate(-50%, 100%); }
}

@media (prefers-reduced-motion: reduce) {
  .dialog-overlay[data-state],
  .dialog[data-state] { animation: none; }
}
</style>
