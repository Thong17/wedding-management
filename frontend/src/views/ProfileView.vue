<script setup lang="ts">
import axios from 'axios'
import { computed, onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { errorMessage } from '@/api/http'
import AppAvatar from '@/components/AppAvatar.vue'
import AppIcon from '@/components/AppIcon.vue'
import ChangePassword from '@/components/ChangePassword.vue'
import { useAuthStore } from '@/stores/auth'
import { useSyncStore } from '@/stores/sync'
import { toast } from '@/utils/toast'

const AVATAR_PX = 256

const auth = useAuthStore()
const sync = useSyncStore()
const { t } = useI18n()

const username = ref(auth.user?.username ?? '')
// undefined: unchanged · null: remove · Blob: new picture
const avatar = ref<Blob | null | undefined>(undefined)
const previewUrl = ref<string | null>(null)
const fieldErrors = ref<Record<string, string[]>>({})
const busy = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

const shownAvatar = computed(() => (avatar.value === undefined ? auth.user?.avatar_url : previewUrl.value))
const trimmed = computed(() => username.value.trim())
const dirty = computed(() => avatar.value !== undefined || trimmed.value !== auth.user?.username)

function setPreview(blob: Blob | null) {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = blob ? URL.createObjectURL(blob) : null
}
onBeforeUnmount(() => setPreview(null))

/** Center-crop to a square and shrink, so phone photos upload as a few dozen KB. */
async function toAvatar(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const side = Math.min(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = AVATAR_PX
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff' // JPEG has no transparency
  ctx.fillRect(0, 0, AVATAR_PX, AVATAR_PX)
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, AVATAR_PX, AVATAR_PX)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9))
  if (!blob) throw new Error(t('profile.pictureUnreadable'))
  return blob
}

async function onPick(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (!file) return
  delete fieldErrors.value.avatar
  try {
    avatar.value = await toAvatar(file)
    setPreview(avatar.value)
  } catch {
    fieldErrors.value = { ...fieldErrors.value, avatar: [t('profile.pictureUnreadable')] }
  }
}

function removePicture() {
  avatar.value = null
  setPreview(null)
}

function reset() {
  username.value = auth.user?.username ?? ''
  avatar.value = undefined
  setPreview(null)
  fieldErrors.value = {}
}

async function save() {
  busy.value = true
  fieldErrors.value = {}
  const renamed = trimmed.value !== auth.user?.username
  try {
    await auth.updateProfile({ username: renamed ? trimmed.value : undefined, avatar: avatar.value })
    avatar.value = undefined
    setPreview(null)
    username.value = auth.user?.username ?? ''
    toast(renamed ? t('profile.savedRenamed', { name: username.value }) : t('profile.saved'))
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 400) fieldErrors.value = err.response.data
    else toast(errorMessage(err), 'error')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div v-if="auth.user" class="container" style="max-width: 560px">
    <form class="card stack" @submit.prevent="save">
      <h1>{{ t('profile.title') }}</h1>
      <div v-if="!sync.browserOnline" class="banner banner-info small">{{ t('profile.needsConnection') }}</div>

      <div class="row picture">
        <AppAvatar :name="trimmed || auth.user.username" :src="shownAvatar" :size="96" />
        <div class="stack">
          <div class="row">
            <button type="button" class="btn-small" @click="fileInput?.click()"><AppIcon name="camera" :size="16" />{{ t('profile.changePicture') }}</button>
            <button v-if="shownAvatar" type="button" class="btn-small btn-danger" @click="removePicture">{{ t('profile.removePicture') }}</button>
          </div>
          <span class="muted small">{{ t('profile.pictureHint') }}</span>
          <span v-if="fieldErrors.avatar" class="field-error">{{ fieldErrors.avatar.join(' ') }}</span>
        </div>
        <input ref="fileInput" type="file" accept="image/*" hidden @change="onPick" />
      </div>

      <label>{{ t('profile.username') }}
        <input v-model="username" required maxlength="150" autocomplete="username" autocapitalize="off" spellcheck="false" />
        <span class="muted small">{{ t('profile.usernameHint') }}</span>
        <span v-if="fieldErrors.username" class="field-error">{{ fieldErrors.username.join(' ') }}</span>
      </label>

      <div class="row">
        <button class="btn-primary" :disabled="busy || !dirty || !trimmed || !sync.browserOnline">
          {{ busy ? t('giftForm.saving') : t('common.save') }}
        </button>
        <button v-if="dirty" type="button" :disabled="busy" @click="reset">{{ t('common.cancel') }}</button>
      </div>
    </form>
    <ChangePassword class="password" />
  </div>
</template>

<style scoped>
.picture { gap: 16px; align-items: center; flex-wrap: nowrap; }
.password { margin-top: 16px; }
</style>
