<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppDialog from '@/components/AppDialog.vue'
import AppIcon from '@/components/AppIcon.vue'
import AppNote from '@/components/AppNote.vue'
import { copyText } from '@/utils/clipboard'
import { toast } from '@/utils/toast'

/**
 * Shown right after creating a login or resetting its password: the website, username and password
 * to hand over, with Copy (one ready-to-send message) and, where the device supports it, Share
 * (e.g. straight into Telegram). The password is shown only here: it can't be looked up later.
 */
const props = defineProps<{ details: { username: string; password: string; reset?: boolean } | null }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()

const url = `${window.location.origin}/login`
const message = computed(() =>
  props.details
    ? t('users.handover.message', { app: t('login.title'), url, username: props.details.username, password: props.details.password })
    : '',
)
const copied = ref(false)
watch(() => props.details, () => (copied.value = false))
const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

async function copy() {
  copied.value = await copyText(message.value)
  if (!copied.value) toast(t('users.handover.copyFailed'), 'error')
}

async function share() {
  try {
    await navigator.share({ text: message.value })
  } catch {
    // dismissed, or the target app refused: nothing to do
  }
}
</script>

<template>
  <AppDialog
    :open="details !== null"
    :title="details?.reset ? t('users.handover.resetTitle') : t('users.handover.title')"
    size="sm"
    @update:open="!$event && emit('close')"
  >
    <div v-if="details" class="stack">
      <AppNote>{{ t('users.handover.hint') }}</AppNote>
      <dl class="handover">
        <dt>{{ t('users.handover.website') }}</dt>
        <dd class="mono">{{ url }}</dd>
        <dt>{{ t('users.username') }}</dt>
        <dd class="mono">{{ details.username }}</dd>
        <dt>{{ t('users.handover.password') }}</dt>
        <dd class="mono">{{ details.password }}</dd>
      </dl>
      <div class="row">
        <button type="button" class="btn-primary icon-btn" @click="copy">
          <AppIcon :name="copied ? 'check' : 'copy'" :size="16" />
          {{ copied ? t('users.handover.copied') : t('users.handover.copy') }}
        </button>
        <button v-if="canShare" type="button" class="icon-btn" @click="share">
          <AppIcon name="share" :size="16" />{{ t('users.handover.share') }}
        </button>
        <span class="spacer" />
        <button type="button" @click="emit('close')">{{ t('common.close') }}</button>
      </div>
    </div>
  </AppDialog>
</template>

<style scoped>
.handover {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 8px 14px;
  margin: 0;
  padding: 12px 14px;
  border: 1px solid var(--c-border);
  border-radius: var(--radius-md);
  background: var(--c-bg);
}
.handover dt { color: var(--c-muted); font-size: 0.9rem; }
.handover dd { margin: 0; font-weight: 600; overflow-wrap: anywhere; user-select: all; }
.icon-btn { display: inline-flex; align-items: center; gap: 6px; }
</style>
