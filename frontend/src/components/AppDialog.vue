<script setup lang="ts">
import { DialogClose, DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/AppIcon.vue'

/**
 * A modal dialog for create / edit forms. Focus is trapped inside, Escape and the close button
 * dismiss it, and it becomes a full-width sheet on phones. Put the form (with its own buttons) in the slot.
 */
const open = defineModel<boolean>('open', { required: true })
withDefaults(defineProps<{ title: string; description?: string; size?: 'sm' | 'md' | 'lg' | 'full' }>(), { size: 'md' })
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
