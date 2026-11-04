<script setup lang="ts">
import {
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogRoot,
  AlertDialogTitle,
} from 'reka-ui'
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { answerDialog, currentDialog, type DialogRequest } from '@/utils/confirmDialog'

/**
 * Shows confirmDialog() / alertDialog() requests. Mounted once in App.vue. Escape and the Cancel
 * button answer "no"; there is no closing by clicking outside, so nothing is confirmed by accident.
 */
const { t } = useI18n()

// Keep the last request's text while the dialog animates closed.
const shown = ref<DialogRequest | null>(null)
watch(currentDialog, (request) => {
  if (request) shown.value = request
})

function onOpenChange(open: boolean) {
  if (!open) answerDialog(false)
}
</script>

<template>
  <AlertDialogRoot :open="!!currentDialog" @update:open="onOpenChange">
    <AlertDialogPortal>
      <AlertDialogOverlay class="dialog-overlay confirm-overlay" />
      <AlertDialogContent v-if="shown" class="dialog dialog-sm confirm-dialog">
        <AlertDialogTitle class="dialog-title">
          {{ shown.title ?? (shown.kind === 'confirm' ? t('common.confirmTitle') : t('app.brand')) }}
        </AlertDialogTitle>
        <AlertDialogDescription class="confirm-message">{{ shown.message }}</AlertDialogDescription>
        <div class="confirm-actions">
          <button v-if="shown.kind === 'confirm'" type="button" @click="answerDialog(false)">
            {{ shown.cancelText ?? t('common.cancel') }}
          </button>
          <button type="button" :class="shown.danger ? 'btn-danger' : 'btn-primary'" @click="answerDialog(true)">
            {{ shown.confirmText ?? (shown.kind === 'confirm' ? t('common.confirm') : t('common.ok')) }}
          </button>
        </div>
      </AlertDialogContent>
    </AlertDialogPortal>
  </AlertDialogRoot>
</template>

<style>
/* Unscoped: portalled to <body>. Uses the shared .dialog look (style.css). */
/* Above any open form dialog (35/36) and menus (40) it is asked from; below tooltips and toasts. */
.confirm-overlay { z-index: 41; }
.dialog.confirm-dialog { z-index: 42; }
.confirm-dialog .dialog-title { margin-bottom: 8px; }
.confirm-message { margin: 0 0 20px; line-height: 1.5; white-space: pre-line; overflow-wrap: anywhere; }
.confirm-actions { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; }
/* Phones: full-width buttons, the confirming one at the bottom within thumb reach. */
@media (max-width: 599px) {
  .confirm-actions { flex-direction: column-reverse; }
  .confirm-actions button { width: 100%; min-height: 48px; }
}
</style>
