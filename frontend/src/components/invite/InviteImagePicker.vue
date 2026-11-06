<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/AppIcon.vue'

/** One picture for the invite (photo, cover, emblem): a thumbnail with Change and Remove, or an upload button. */
defineProps<{ label: string; url: string | null; busy?: boolean; round?: boolean }>()
const emit = defineEmits<{ pick: [file: File]; clear: [] }>()
const { t } = useI18n()
const input = ref<HTMLInputElement | null>(null)

function onChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (file) emit('pick', file)
}
</script>

<template>
  <div class="picker">
    <span class="picker-label">{{ label }}</span>
    <div class="row">
      <img v-if="url" :src="url" alt="" class="thumb" :class="{ round }" />
      <div v-else class="thumb empty" :class="{ round }"><AppIcon name="image" /></div>
      <div class="actions">
        <button type="button" class="btn-small" :disabled="busy" @click="input?.click()">
          <AppIcon name="image" :size="14" />{{ busy ? t('invite.uploading') : url ? t('invite.change') : t('invite.upload') }}
        </button>
        <button v-if="url" type="button" class="btn-small btn-danger" :disabled="busy" @click="emit('clear')">
          <AppIcon name="trash" :size="14" />{{ t('common.remove') }}
        </button>
      </div>
    </div>
    <input ref="input" type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden @change="onChange" />
  </div>
</template>

<style scoped>
.picker { display: flex; flex-direction: column; gap: 6px; }
.picker-label { font-weight: 600; font-size: 0.9rem; }
.thumb { width: 64px; height: 64px; object-fit: cover; border-radius: 8px; border: 1px solid var(--c-border); flex-shrink: 0; }
.thumb.round { border-radius: 50%; }
.empty { display: flex; align-items: center; justify-content: center; color: var(--c-muted); background: var(--c-bg); }
.actions { display: flex; flex-wrap: wrap; gap: 6px; }
.actions .btn-small { display: inline-flex; align-items: center; gap: 4px; }
</style>
