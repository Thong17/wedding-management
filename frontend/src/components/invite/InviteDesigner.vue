<script setup lang="ts">
import axios from 'axios'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { onBeforeRouteLeave } from 'vue-router'
import { invitesApi } from '@/api/endpoints'
import { errorMessage } from '@/api/http'
import type { ApiEvent, ApiInvite } from '@/api/types'
import AppDatePicker from '@/components/AppDatePicker.vue'
import AppDialog from '@/components/AppDialog.vue'
import AppIcon from '@/components/AppIcon.vue'
import AppSelect from '@/components/AppSelect.vue'
import AppSkeleton from '@/components/AppSkeleton.vue'
import AppTooltip from '@/components/AppTooltip.vue'
import {
  CARD_STYLES,
  EMBLEMS,
  FONTS,
  LANGUAGES,
  MAX_BANK_QRS,
  MAX_GALLERY,
  MAX_MOMENTS,
  MAX_PARTS,
  MUSIC,
  OPENING_STYLES,
  newMoment,
  newPart,
  withDefaults as fillDefaults,
  type InviteConfig,
  type InviteImages,
  type InviteLanguage,
  type ProgrammePart,
  type PreviewDevice,
} from '@/invite/config'
import { inviteLabels } from '@/invite/labels'
import { copyText } from '@/utils/clipboard'
import { confirmDialog } from '@/utils/confirmDialog'
import { resizeImage } from '@/utils/resizeImage'
import { toast } from '@/utils/toast'
import InvitationView from './InvitationView.vue'
import InviteImagePicker from './InviteImagePicker.vue'
import InvitePreviewFrame from './InvitePreviewFrame.vue'

/**
 * The event's e-invite editor: settings on the left, a live preview beside them, and Save draft /
 * Preview / Publish on top. Guests see only what was last published; the draft can be changed freely.
 */
const props = defineProps<{ event: ApiEvent }>()
const { t } = useI18n()

const loading = ref(true)
const loadError = ref<string | null>(null)
const invite = ref<ApiInvite | null>(null)
const draft = ref<InviteConfig>(fillDefaults(null))
const images = ref<InviteImages>({})
const slug = ref('')
const savedKey = ref('')
const saving = ref(false)
const publishing = ref(false)
const fieldErrors = ref<Record<string, string>>({})

const keyOf = () => JSON.stringify({ draft: draft.value, slug: slug.value || null })
const dirty = computed(() => !loading.value && keyOf() !== savedKey.value)
const published = computed(() => invite.value?.status === 'published')
const publicUrl = computed(() => (invite.value?.slug ? `${location.origin}/e-invite/${invite.value.slug}` : ''))
const status = computed(() => {
  if (!published.value) return { label: t('invite.statusDraft'), cls: 'badge-neutral' }
  if (dirty.value || invite.value?.has_changes) return { label: t('invite.statusChanges'), cls: 'badge-pending' }
  return { label: t('invite.statusPublished'), cls: 'badge-synced' }
})

function apply(data: ApiInvite) {
  invite.value = data
  draft.value = fillDefaults(data.draft)
  images.value = { ...data.images }
  slug.value = data.slug ?? ''
  savedKey.value = keyOf()
}

async function load() {
  loading.value = true
  loadError.value = null
  try {
    apply(await invitesApi.get(props.event.id))
    editLang.value = draft.value.content.language
  } catch (err) {
    loadError.value = errorMessage(err)
  } finally {
    loading.value = false
  }
}
onMounted(load)

/** Field errors come back as {"content.maps_url": "..."}; anything else is a general error. */
function handleError(err: unknown) {
  if (axios.isAxiosError(err) && err.response?.status === 409) {
    const current = (err.response.data as { current?: ApiInvite }).current
    if (current) apply(current)
    toast(t('invite.conflict'), 'error', 6000)
    return
  }
  if (axios.isAxiosError(err) && err.response?.status === 400 && err.response.data && typeof err.response.data === 'object') {
    const data = err.response.data as Record<string, unknown>
    fieldErrors.value = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, Array.isArray(v) ? String(v[0]) : String(v)]))
    toast(Object.values(fieldErrors.value)[0] ?? t('invite.checkFields'), 'error', 6000)
    return
  }
  toast(errorMessage(err), 'error')
}

async function save(quiet = false): Promise<boolean> {
  saving.value = true
  fieldErrors.value = {}
  try {
    apply(await invitesApi.save(props.event.id, { draft: draft.value, slug: slug.value || null, revision: invite.value?.revision ?? 0 }))
    if (!quiet) toast(t('invite.saved'))
    return true
  } catch (err) {
    handleError(err)
    return false
  } finally {
    saving.value = false
  }
}

async function publish() {
  publishing.value = true
  try {
    if ((dirty.value || !invite.value?.revision) && !(await save(true))) return
    const first = !published.value
    apply(await invitesApi.publish(props.event.id, invite.value!.revision))
    toast(first ? t('invite.publishedFirst') : t('invite.republished'))
  } catch (err) {
    handleError(err)
  } finally {
    publishing.value = false
  }
}

async function unpublish() {
  const ok = await confirmDialog({ message: t('invite.unpublishConfirm'), confirmText: t('invite.unpublish'), danger: true })
  if (!ok) return
  try {
    const keep = { draft: draft.value, slug: slug.value }
    const wasDirty = dirty.value
    apply(await invitesApi.unpublish(props.event.id))
    // Unsaved edits stay in the editor.
    if (wasDirty) {
      draft.value = keep.draft
      slug.value = keep.slug
    }
    toast(t('invite.unpublished'), 'info')
  } catch (err) {
    handleError(err)
  }
}

async function copyLink() {
  if (await copyText(publicUrl.value)) toast(t('invite.copied'))
  else toast(t('invite.copyFailed'), 'error')
}

// Pictures: shrunk in the browser first, then uploaded; the design refers to them by id.
const uploading = ref<string | null>(null)
type UploadKind = 'hero' | 'gallery' | 'cover' | 'emblem' | 'bank0' | 'bank1'
// Logos and bank QR codes stay sharp PNGs (a blurred QR code would not scan); photos become JPEGs.
const SHRINK: Partial<Record<UploadKind, Parameters<typeof resizeImage>[1]>> = {
  emblem: { maxSide: 600, type: 'image/png' },
  bank0: { maxSide: 1400, type: 'image/png' },
  bank1: { maxSide: 1400, type: 'image/png' },
}
async function upload(file: File, kind: UploadKind) {
  uploading.value = kind
  try {
    const blob = await resizeImage(file, SHRINK[kind] ?? { maxSide: 2000 }).catch(() => {
      throw new Error(t('invite.unreadable'))
    })
    const { id, url } = await invitesApi.uploadImage(props.event.id, blob)
    images.value = { ...images.value, [String(id)]: url }
    const c = draft.value
    if (kind === 'hero') c.content.hero_photo = id
    else if (kind === 'gallery') c.content.gallery = [...c.content.gallery, id]
    else if (kind === 'cover') c.animation.cover_image = id
    else if (kind === 'bank0' || kind === 'bank1') setBankQr(Number(kind.slice(4)), id)
    else {
      c.animation.emblem_image = id
      c.animation.emblem = 'image'
    }
  } catch (err) {
    toast(errorMessage(err), 'error')
  } finally {
    uploading.value = null
  }
}
const imageUrl = (id: number | null) => (id != null ? images.value[String(id)] ?? null : null)

// Bank QR codes: slot 1 and 2. Replacing one keeps its label; removing the first moves the second up.
const bankSlots = computed(() => Array.from({ length: Math.min(MAX_BANK_QRS, draft.value.content.bank_qrs.length + 1) }, (_, i) => i))
function setBankQr(slot: number, image: number) {
  const list = draft.value.content.bank_qrs
  if (list[slot]) list[slot].image = image
  else list.push({ image, label: '' })
}
function removeBankQr(slot: number) {
  draft.value.content.bank_qrs = draft.value.content.bank_qrs.filter((_, i) => i !== slot)
}

// The organizer's own song for the background music (uploaded as is; the server checks it).
const SONG_MAX_BYTES = 12 * 1024 * 1024
const songInput = ref<HTMLInputElement | null>(null)
async function onSongPick(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (file.size > SONG_MAX_BYTES) {
    toast(t('invite.songTooBig'), 'error')
    return
  }
  uploading.value = 'song'
  try {
    const { id, url } = await invitesApi.uploadAudio(props.event.id, file)
    images.value = { ...images.value, [String(id)]: url }
    draft.value.audio.music_file = id
    draft.value.audio.music = 'upload'
  } catch (err) {
    toast(errorMessage(err), 'error')
  } finally {
    uploading.value = null
  }
}
const musicOptions = computed(() => MUSIC.map((m) => ({ value: m, label: t(`invite.musics.${m}`) })))
const galleryInput = ref<HTMLInputElement | null>(null)
async function onGalleryPick(e: Event) {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files ?? []).slice(0, MAX_GALLERY - draft.value.content.gallery.length)
  input.value = ''
  for (const file of files) await upload(file, 'gallery')
}
function moveGallery(index: number, by: number) {
  const list = [...draft.value.content.gallery]
  const to = index + by
  if (to < 0 || to >= list.length) return
  ;[list[index], list[to]] = [list[to], list[index]]
  draft.value.content.gallery = list
}
function removeGallery(index: number) {
  draft.value.content.gallery = draft.value.content.gallery.filter((_, i) => i !== index)
}

// Options for the selects.
const fontOptions = computed(() => FONTS.map((f) => ({ value: f, label: t(`invite.fonts.${f}`) })))
const cardOptions = computed(() => CARD_STYLES.map((s) => ({ value: s, label: t(`invite.cards.${s}`) })))
const openingOptions = computed(() => OPENING_STYLES.map((s) => ({ value: s, label: t(`invite.openings.${s}`) })))
const emblemOptions = computed(() => EMBLEMS.map((s) => ({ value: s, label: t(`invite.emblems.${s}`) })))
const languageOptions = computed(() => LANGUAGES.map((l) => ({ value: l, label: t(`invite.languages.${l}`) })))
// What a blank greeting or title shows, as the placeholder.
const defaults = computed(() => inviteLabels(editLang.value))

// The words are written per language. Fields left blank show the other language's words (which guests
// then see too) as their placeholder.
const editLang = ref<InviteLanguage>('km')
const otherLang = computed<InviteLanguage>(() => (editLang.value === 'km' ? 'en' : 'km'))
const words = computed(() => draft.value.content.text[editLang.value])
const otherWords = computed(() => draft.value.content.text[otherLang.value])

// The programme: parts of the day (each with its place and map) and their moments. Add, reorder, remove.
function moved<T>(list: T[], index: number, by: number): T[] {
  const copy = [...list]
  const to = index + by
  if (to < 0 || to >= copy.length) return copy
  ;[copy[index], copy[to]] = [copy[to], copy[index]]
  return copy
}
function addPart() {
  const parts = draft.value.content.timeline
  const part = newPart()
  part.date = parts[parts.length - 1]?.date ?? '' // often the same day as the part before
  parts.push(part)
}
function movePart(index: number, by: number) {
  draft.value.content.timeline = moved(draft.value.content.timeline, index, by)
}
function removePart(index: number) {
  draft.value.content.timeline = draft.value.content.timeline.filter((_, i) => i !== index)
}
function addMoment(part: ProgrammePart) {
  part.items.push(newMoment())
}
function moveMoment(part: ProgrammePart, index: number, by: number) {
  part.items = moved(part.items, index, by)
}
function removeMoment(part: ProgrammePart, index: number) {
  part.items = part.items.filter((_, i) => i !== index)
}

// Live preview beside the settings, and the full-screen Preview.
const sideDevice = ref<PreviewDevice>('phone')
const sideView = ref<InstanceType<typeof InvitationView> | null>(null)
const previewOpen = ref(false)
const previewDevice = ref<PreviewDevice>(window.matchMedia('(max-width: 899px)').matches ? 'phone' : 'desktop')
const previewKey = ref(0)
function openPreview() {
  previewKey.value++ // start again from the cover
  previewOpen.value = true
}
const devices: { value: PreviewDevice; icon: 'phone' | 'tablet' | 'monitor' }[] = [
  { value: 'phone', icon: 'phone' },
  { value: 'tablet', icon: 'tablet' },
  { value: 'desktop', icon: 'monitor' },
]
const host = location.host
const eventFacts = computed(() => ({ date: props.event.date, venue: props.event.venue }))

// Leaving with unsaved changes asks first (in the app and when closing the tab).
onBeforeRouteLeave(async () => (dirty.value ? await confirmDialog({ message: t('invite.leaveConfirm'), confirmText: t('invite.leave'), danger: true }) : true))
const onBeforeUnload = (e: BeforeUnloadEvent) => {
  if (dirty.value) e.preventDefault()
}
window.addEventListener('beforeunload', onBeforeUnload)
onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload))

function replaySide() {
  sideView.value?.replay()
}
</script>

<template>
  <div class="designer">
    <div v-if="loadError" class="banner banner-danger">{{ loadError }}</div>
    <AppSkeleton v-else-if="loading" variant="page" />

    <template v-else>
      <!-- Toolbar -->
      <div class="toolbar card">
        <div class="row toolbar-row">
          <div class="toolbar-title">
            <strong>{{ t('invite.title') }}</strong>
            <span class="badge" :class="status.cls">{{ status.label }}</span>
          </div>
          <span class="spacer" />
          <button type="button" :disabled="saving || !dirty" @click="save()">
            <AppIcon name="check" :size="16" />{{ saving ? t('invite.saving') : t('invite.saveDraft') }}
          </button>
          <button type="button" @click="openPreview"><AppIcon name="eye" :size="16" />{{ t('invite.preview') }}</button>
          <button
            type="button"
            class="btn-primary"
            :disabled="publishing || saving || (published && !dirty && !invite?.has_changes)"
            @click="publish"
          >
            <AppIcon name="globe" :size="16" />{{ publishing ? t('invite.publishing') : published ? t('invite.republish') : t('invite.publish') }}
          </button>
        </div>
        <div v-if="published" class="published row">
          <AppIcon name="globe" :size="16" />
          <input class="url" :value="publicUrl" readonly :aria-label="t('invite.publicLink')" @focus="($event.target as HTMLInputElement).select()" />
          <AppTooltip :text="t('invite.copyLink')">
            <button type="button" class="btn-small" @click="copyLink"><AppIcon name="copy" :size="14" />{{ t('invite.copy') }}</button>
          </AppTooltip>
          <a class="btn btn-small" :href="publicUrl" target="_blank" rel="noopener"><AppIcon name="external" :size="14" />{{ t('invite.open') }}</a>
          <button type="button" class="btn-small btn-danger" @click="unpublish">{{ t('invite.unpublish') }}</button>
        </div>
        <p v-else class="muted small">{{ t('invite.notPublishedHint') }}</p>
      </div>

      <div class="workspace">
        <!-- Settings -->
        <div class="panel stack">
          <details class="section card" open>
            <summary><AppIcon name="palette" :size="16" />{{ t('invite.appearance') }}</summary>
            <div class="stack">
              <div class="colors">
                <label class="color">
                  {{ t('invite.background') }}
                  <span class="row"><input v-model="draft.design.background" type="color" /><input v-model.lazy="draft.design.background" class="hex" maxlength="7" /></span>
                </label>
                <label class="color">
                  {{ t('invite.textColor') }}
                  <span class="row"><input v-model="draft.design.text_color" type="color" /><input v-model.lazy="draft.design.text_color" class="hex" maxlength="7" /></span>
                </label>
                <label class="color">
                  {{ t('invite.gold') }}
                  <span class="row"><input v-model="draft.design.accent" type="color" /><input v-model.lazy="draft.design.accent" class="hex" maxlength="7" /></span>
                </label>
              </div>
              <label>{{ t('invite.font') }} <AppSelect v-model="draft.design.font" :options="fontOptions" /></label>
              <label>{{ t('invite.cardStyle') }} <AppSelect v-model="draft.design.card_style" :options="cardOptions" /></label>
              <fieldset class="checks">
                <legend>{{ t('invite.decorations') }}</legend>
                <label class="check"><input v-model="draft.design.gold_border" type="checkbox" />{{ t('invite.goldBorder') }}</label>
                <label class="check"><input v-model="draft.design.gold_corners" type="checkbox" />{{ t('invite.goldCorners') }}</label>
                <label class="check"><input v-model="draft.design.gold_dividers" type="checkbox" />{{ t('invite.goldDividers') }}</label>
                <label class="check"><input v-model="draft.design.sparkles" type="checkbox" />{{ t('invite.sparkles') }}</label>
              </fieldset>
            </div>
          </details>

          <details class="section card" open>
            <summary><AppIcon name="edit" :size="16" />{{ t('invite.content') }}</summary>
            <div class="stack">
              <!-- The words, written per language (guests switch with the language button); the tab picks which. -->
              <div class="tabs lang-tabs" role="tablist" :aria-label="t('invite.writingIn')">
                <button
                  v-for="l in LANGUAGES"
                  :key="l"
                  type="button"
                  role="tab"
                  :aria-selected="editLang === l"
                  :class="{ active: editLang === l }"
                  @click="editLang = l"
                >
                  {{ t(`invite.languages.${l}`) }}
                </button>
              </div>
              <label>{{ t('invite.language') }} <AppSelect v-model="draft.content.language" :options="languageOptions" /></label>
              <div class="row two">
                <label class="grow">{{ t('invite.groom') }} <input v-model="words.partner1" maxlength="80" :placeholder="otherWords.partner1" /></label>
                <label class="grow">{{ t('invite.bride') }} <input v-model="words.partner2" maxlength="80" :placeholder="otherWords.partner2" /></label>
              </div>
              <label>{{ t('invite.titleField') }} <input v-model="words.title" maxlength="120" :placeholder="defaults.defaultTitle" /></label>
              <label>
                {{ t('invite.greeting') }}
                <textarea v-model="words.greeting" rows="3" maxlength="200" :placeholder="defaults.defaultGreeting" />
              </label>
              <label>{{ t('invite.message') }} <textarea v-model="words.message" rows="6" maxlength="2000" :placeholder="otherWords.message" /></label>
              <!-- Bank QR codes for gifts, shown below the message. -->
              <div class="bank-edit">
                <span class="picker-label">{{ t('invite.bankQrs') }}</span>
                <div v-for="slot in bankSlots" :key="slot" class="bank-slot">
                  <InviteImagePicker
                    :label="t('invite.bankQrN', { n: slot + 1 })"
                    :url="imageUrl(draft.content.bank_qrs[slot]?.image ?? null)"
                    :busy="uploading === `bank${slot}`"
                    @pick="upload($event, slot === 0 ? 'bank0' : 'bank1')"
                    @clear="removeBankQr(slot)"
                  />
                  <input
                    v-if="draft.content.bank_qrs[slot]"
                    v-model="draft.content.bank_qrs[slot].label"
                    maxlength="80"
                    :aria-label="t('invite.bankLabel')"
                    :placeholder="t('invite.bankLabelPlaceholder')"
                  />
                </div>
              </div>
              <InviteImagePicker
                :label="t('invite.heroPhoto')"
                :url="imageUrl(draft.content.hero_photo)"
                :busy="uploading === 'hero'"
                @pick="upload($event, 'hero')"
                @clear="draft.content.hero_photo = null"
              />
              <div class="gallery-edit">
                <span class="picker-label">{{ t('invite.gallery', { n: draft.content.gallery.length, max: MAX_GALLERY }) }}</span>
                <div class="thumbs">
                  <div v-for="(id, i) in draft.content.gallery" :key="id" class="thumb-item">
                    <img :src="imageUrl(id) ?? ''" alt="" />
                    <div class="thumb-actions">
                      <button type="button" class="btn-icon" :aria-label="t('invite.moveLeft')" :disabled="i === 0" @click="moveGallery(i, -1)"><AppIcon name="chevron-left" :size="14" /></button>
                      <button type="button" class="btn-icon" :aria-label="t('common.remove')" @click="removeGallery(i)"><AppIcon name="x" :size="14" /></button>
                      <button type="button" class="btn-icon" :aria-label="t('invite.moveRight')" :disabled="i === draft.content.gallery.length - 1" @click="moveGallery(i, 1)"><AppIcon name="chevron-right" :size="14" /></button>
                    </div>
                  </div>
                  <button
                    v-if="draft.content.gallery.length < MAX_GALLERY"
                    type="button"
                    class="thumb-add"
                    :disabled="uploading === 'gallery'"
                    @click="galleryInput?.click()"
                  >
                    <AppIcon name="plus" />{{ uploading === 'gallery' ? t('invite.uploading') : t('invite.addPhotos') }}
                  </button>
                </div>
                <input ref="galleryInput" type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden @change="onGalleryPick" />
              </div>
            </div>
          </details>

          <details class="section card" open>
            <summary><AppIcon name="calendar" :size="16" />{{ t('invite.programme') }}</summary>
            <div class="stack">
              <div class="tabs lang-tabs" role="tablist" :aria-label="t('invite.writingIn')">
                <button
                  v-for="l in LANGUAGES"
                  :key="l"
                  type="button"
                  role="tab"
                  :aria-selected="editLang === l"
                  :class="{ active: editLang === l }"
                  @click="editLang = l"
                >
                  {{ t(`invite.languages.${l}`) }}
                </button>
              </div>
              <p v-if="!draft.content.timeline.length" class="muted small">{{ t('invite.programmeEmpty') }}</p>
              <!-- A part of the day (e.g. Morning): its place and map, then its moments. -->
              <div v-for="(part, p) in draft.content.timeline" :key="p" class="part-edit">
                <div class="row part-head">
                  <strong>{{ part.text[editLang].title || part.text[otherLang].title || t('invite.partN', { n: p + 1 }) }}</strong>
                  <span class="spacer" />
                  <button type="button" class="btn-icon" :aria-label="t('invite.moveUp')" :disabled="p === 0" @click="movePart(p, -1)"><AppIcon name="chevron-up" :size="16" /></button>
                  <button type="button" class="btn-icon" :aria-label="t('invite.moveDown')" :disabled="p === draft.content.timeline.length - 1" @click="movePart(p, 1)"><AppIcon name="chevron-down" :size="16" /></button>
                  <button type="button" class="btn-icon danger" :aria-label="t('invite.removePart')" @click="removePart(p)"><AppIcon name="trash" :size="16" /></button>
                </div>
                <div class="row two">
                  <label class="grow">
                    {{ t('invite.partTitle') }}
                    <input v-model="part.text[editLang].title" maxlength="120" :placeholder="part.text[otherLang].title || t('invite.partTitlePlaceholder')" />
                  </label>
                  <label class="grow">{{ t('invite.momentDate') }} <AppDatePicker v-model="part.date" /></label>
                </div>
                <label>{{ t('invite.momentPlace') }} <input v-model="part.text[editLang].place" maxlength="200" :placeholder="part.text[otherLang].place" /></label>
                <label>{{ t('invite.address') }} <input v-model="part.text[editLang].address" maxlength="300" :placeholder="part.text[otherLang].address" /></label>
                <label>
                  {{ t('invite.mapsUrl') }}
                  <input v-model.trim="part.maps_url" type="url" inputmode="url" placeholder="https://maps.app.goo.gl/…" />
                  <span class="field-error" v-if="fieldErrors[`content.timeline.${p}.maps_url`]">{{ fieldErrors[`content.timeline.${p}.maps_url`] }}</span>
                  <span v-else class="muted small">{{ t('invite.partMapHint') }}</span>
                </label>

                <span class="picker-label">{{ t('invite.moments') }}</span>
                <ol class="moments-edit">
                  <li v-for="(moment, i) in part.items" :key="i" class="moment-edit">
                    <span class="moment-n">{{ i + 1 }}</span>
                    <input v-model="moment.time" type="time" class="moment-time" :aria-label="t('invite.time')" />
                    <input
                      v-model="moment.text[editLang].title"
                      maxlength="160"
                      class="moment-what"
                      :aria-label="t('invite.momentTitle')"
                      :placeholder="moment.text[otherLang].title || t('invite.momentTitlePlaceholder')"
                    />
                    <span class="moment-actions">
                      <button type="button" class="btn-icon" :aria-label="t('invite.moveUp')" :disabled="i === 0" @click="moveMoment(part, i, -1)"><AppIcon name="chevron-up" :size="14" /></button>
                      <button type="button" class="btn-icon" :aria-label="t('invite.moveDown')" :disabled="i === part.items.length - 1" @click="moveMoment(part, i, 1)"><AppIcon name="chevron-down" :size="14" /></button>
                      <button type="button" class="btn-icon danger" :aria-label="t('common.remove')" @click="removeMoment(part, i)"><AppIcon name="x" :size="14" /></button>
                    </span>
                  </li>
                </ol>
                <button v-if="part.items.length < MAX_MOMENTS" type="button" class="btn-small add-moment" @click="addMoment(part)">
                  <AppIcon name="plus" :size="14" />{{ t('invite.addMoment') }}
                </button>
              </div>
              <button v-if="draft.content.timeline.length < MAX_PARTS" type="button" class="add-part" @click="addPart">
                <AppIcon name="plus" :size="16" />{{ t('invite.addPart') }}
              </button>
            </div>
          </details>

          <details class="section card" open>
            <summary><AppIcon name="gift" :size="16" />{{ t('invite.opening') }}</summary>
            <div class="stack">
              <label class="check"><input v-model="draft.animation.enabled" type="checkbox" />{{ t('invite.openingOn') }}</label>
              <template v-if="draft.animation.enabled">
                <label>{{ t('invite.openingStyle') }} <AppSelect v-model="draft.animation.style" :options="openingOptions" /></label>
                <label class="color">
                  {{ t('invite.coverColor') }}
                  <span class="row"><input v-model="draft.animation.cover_color" type="color" /><input v-model.lazy="draft.animation.cover_color" class="hex" maxlength="7" /></span>
                </label>
                <label class="check"><input v-model="draft.animation.particles" type="checkbox" />{{ t('invite.particles') }}</label>
                <InviteImagePicker
                  :label="t('invite.coverImage')"
                  :url="imageUrl(draft.animation.cover_image)"
                  :busy="uploading === 'cover'"
                  @pick="upload($event, 'cover')"
                  @clear="draft.animation.cover_image = null"
                />
                <label>{{ t('invite.emblem') }} <AppSelect v-model="draft.animation.emblem" :options="emblemOptions" /></label>
                <InviteImagePicker
                  v-if="draft.animation.emblem === 'image'"
                  :label="t('invite.emblemImage')"
                  :url="imageUrl(draft.animation.emblem_image)"
                  :busy="uploading === 'emblem'"
                  round
                  @pick="upload($event, 'emblem')"
                  @clear="draft.animation.emblem_image = null"
                />
              </template>
            </div>
          </details>

          <details class="section card" open>
            <summary><AppIcon name="music" :size="16" />{{ t('invite.sound') }}</summary>
            <div class="stack">
              <label>{{ t('invite.music') }} <AppSelect v-model="draft.audio.music" :options="musicOptions" /></label>
              <div v-if="draft.audio.music === 'upload'" class="song">
                <audio v-if="imageUrl(draft.audio.music_file)" :src="imageUrl(draft.audio.music_file)!" controls preload="none" class="song-player" />
                <p v-else class="muted small">{{ t('invite.noSong') }}</p>
                <button type="button" class="btn-small" :disabled="uploading === 'song'" @click="songInput?.click()">
                  <AppIcon name="music" :size="14" />{{ uploading === 'song' ? t('invite.uploading') : imageUrl(draft.audio.music_file) ? t('invite.changeSong') : t('invite.uploadSong') }}
                </button>
                <span class="muted small">{{ t('invite.songHint') }}</span>
                <input ref="songInput" type="file" accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/aac,audio/ogg,audio/wav,.mp3,.m4a,.ogg,.wav" hidden @change="onSongPick" />
              </div>
              <label v-if="draft.audio.music !== 'none'">
                {{ t('invite.volume', { n: draft.audio.volume }) }}
                <input v-model.number="draft.audio.volume" type="range" min="0" max="100" step="5" class="volume" />
              </label>
              <label class="check"><input v-model="draft.audio.open_sound" type="checkbox" />{{ t('invite.openSound') }}</label>
              <p class="muted small">{{ t('invite.soundHint') }}</p>
            </div>
          </details>

          <details class="section card">
            <summary><AppIcon name="globe" :size="16" />{{ t('invite.link') }}</summary>
            <div class="stack">
              <label>
                {{ t('invite.slug') }}
                <span class="slug-row"><span class="muted small prefix">{{ `${host}/e-invite/` }}</span><input v-model.trim="slug" maxlength="60" :placeholder="t('invite.slugPlaceholder')" /></span>
                <span class="field-error" v-if="fieldErrors.slug">{{ fieldErrors.slug }}</span>
                <span v-else class="muted small">{{ t('invite.slugHint') }}</span>
              </label>
            </div>
          </details>
        </div>

        <!-- Live preview -->
        <div class="preview card">
          <div class="row preview-bar">
            <strong class="small">{{ t('invite.livePreview') }}</strong>
            <span class="spacer" />
            <div class="segmented" role="group" :aria-label="t('invite.device')">
              <AppTooltip v-for="d in devices" :key="d.value" :text="t(`invite.devices.${d.value}`)">
                <button type="button" class="btn-icon" :class="{ active: sideDevice === d.value }" :aria-label="t(`invite.devices.${d.value}`)" :aria-pressed="sideDevice === d.value" @click="sideDevice = d.value">
                  <AppIcon :name="d.icon" :size="16" />
                </button>
              </AppTooltip>
            </div>
            <AppTooltip :text="t('invite.replay')">
              <button type="button" class="btn-icon" :aria-label="t('invite.replay')" :disabled="!draft.animation.enabled" @click="replaySide"><AppIcon name="replay" :size="16" /></button>
            </AppTooltip>
          </div>
          <div class="preview-area">
            <InvitePreviewFrame :device="sideDevice">
              <InvitationView ref="sideView" :config="draft" :images="images" :event="eventFacts" :language="editLang" start-open />
            </InvitePreviewFrame>
          </div>
        </div>
      </div>
    </template>

    <AppDialog v-model:open="previewOpen" :title="t('invite.previewTitle')" size="full">
      <div class="preview-dialog">
        <div class="row preview-bar">
          <span class="muted small">{{ t('invite.previewHint') }}</span>
          <span class="spacer" />
          <div class="segmented" role="group" :aria-label="t('invite.device')">
            <button
              v-for="d in devices"
              :key="d.value"
              type="button"
              class="btn-small"
              :class="{ active: previewDevice === d.value }"
              :aria-pressed="previewDevice === d.value"
              @click="previewDevice = d.value"
            >
              <AppIcon :name="d.icon" :size="14" /><span class="device-label">{{ t(`invite.devices.${d.value}`) }}</span>
            </button>
          </div>
          <button type="button" class="btn-small" @click="previewKey++"><AppIcon name="replay" :size="14" />{{ t('invite.replay') }}</button>
        </div>
        <div class="preview-stage">
          <InvitePreviewFrame :device="previewDevice">
            <InvitationView :key="previewKey" :config="draft" :images="images" :event="eventFacts" />
          </InvitePreviewFrame>
        </div>
      </div>
    </AppDialog>
  </div>
</template>

<style scoped>
.designer { display: flex; flex-direction: column; gap: 12px; }
.toolbar { display: flex; flex-direction: column; gap: 10px; position: sticky; top: var(--header-height, 0); z-index: 4; }
.toolbar-row { flex-wrap: wrap; gap: 8px; }
.toolbar-row button, .published .btn-small, .published a { display: inline-flex; align-items: center; gap: 6px; }
.toolbar-title { display: flex; align-items: center; gap: 8px; }
.published { gap: 8px; flex-wrap: wrap; padding-top: 10px; border-top: 1px solid var(--c-border); color: var(--c-muted); }
.url { flex: 1 1 240px; min-width: 0; font-family: ui-monospace, monospace; font-size: 0.85rem; }
.published a { text-decoration: none; }

.workspace { display: grid; gap: 12px; grid-template-columns: minmax(0, 1fr); align-items: start; }
@media (min-width: 1000px) {
  .workspace { grid-template-columns: minmax(320px, 400px) minmax(0, 1fr); }
  .preview { position: sticky; top: calc(var(--header-height, 0px) + 150px); }
}
.panel { gap: 12px; }
.section { padding: 0; }
.section summary {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 16px;
  cursor: pointer;
  font-weight: 600;
  list-style: none;
}
.section summary::-webkit-details-marker { display: none; }
.section summary::after { content: '▾'; margin-left: auto; color: var(--c-muted); transition: transform 0.2s; }
.section:not([open]) summary::after { transform: rotate(-90deg); }
.section > .stack { padding: 0 16px 16px; }

.colors { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
.color .row { gap: 6px; flex-wrap: nowrap; }
.color input[type='color'] { width: 44px; height: 40px; padding: 2px; border-radius: 8px; flex-shrink: 0; cursor: pointer; }
.hex { font-family: ui-monospace, monospace; flex: 1; width: auto; min-width: 0; }
.two { gap: 10px; flex-wrap: wrap; }
.two .grow { flex: 1 1 140px; }
.time { flex: 0 1 140px; }
.checks { border: 0; padding: 0; margin: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 6px; }
.checks legend { font-weight: 600; font-size: 0.9rem; margin-bottom: 6px; padding: 0; }
.check { display: flex; flex-direction: row; align-items: center; gap: 8px; font-weight: 400; }
.check input { width: auto; min-height: 0; }
textarea { resize: vertical; }

.picker-label { font-weight: 600; font-size: 0.9rem; }
.gallery-edit { display: flex; flex-direction: column; gap: 6px; }
.thumbs { display: grid; grid-template-columns: repeat(auto-fill, minmax(92px, 1fr)); gap: 8px; }
.thumb-item { position: relative; aspect-ratio: 1; border-radius: 8px; overflow: hidden; border: 1px solid var(--c-border); }
.thumb-item img { width: 100%; height: 100%; object-fit: cover; display: block; }
.thumb-actions { position: absolute; inset: auto 0 0 0; display: flex; justify-content: space-between; padding: 4px; background: linear-gradient(transparent, rgb(0 0 0 / 0.55)); }
.thumb-actions .btn-icon { width: 26px; height: 26px; min-height: 26px; padding: 0; border-radius: 50%; background: rgb(255 255 255 / 0.9); color: #222; border: 0; }
.thumb-add {
  aspect-ratio: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  font-size: 0.8rem;
  border-style: dashed;
}
.lang-tabs { margin-top: -4px; }
.bank-edit { display: flex; flex-direction: column; gap: 10px; }
.bank-slot { display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; border: 1px solid var(--c-border); border-radius: 10px; background: var(--c-bg); }
.part-edit { display: flex; flex-direction: column; gap: 10px; padding: 12px; border: 1px solid var(--c-border); border-radius: 10px; background: var(--c-bg); }
.part-head { gap: 4px; }
.part-head .btn-icon, .moment-actions .btn-icon { width: 32px; height: 32px; min-height: 32px; padding: 0; justify-content: center; }
.part-head .danger, .moment-actions .danger { color: var(--c-danger); }
.moments-edit { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
/* Each moment on two lines (the panel is narrow): number, time and buttons; then what happens. */
.moment-edit { display: grid; grid-template-columns: 22px minmax(0, 150px) 1fr auto; align-items: center; gap: 6px; padding-bottom: 6px; border-bottom: 1px dashed var(--c-border); }
.moment-edit:last-child { border-bottom: 0; }
.moment-what { grid-column: 2 / -1; }
.moment-actions { grid-row: 1; grid-column: 4; }
.moment-n { width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 700; color: var(--c-primary); border: 1px solid var(--c-primary); }
.moment-actions { display: inline-flex; }
.add-moment { align-self: flex-start; display: inline-flex; align-items: center; gap: 4px; }
.add-part { display: inline-flex; align-items: center; justify-content: center; gap: 6px; border-style: dashed; }
.song { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; }
.song .btn-small { display: inline-flex; align-items: center; gap: 4px; }
.song-player { width: 100%; height: 40px; }
.volume { padding: 0; min-height: 0; accent-color: var(--c-primary); }
.slug-row { display: flex; align-items: center; gap: 6px; }
.slug-row .prefix { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 45%; }
.slug-row input { flex: 1; min-width: 0; }

.preview { display: flex; flex-direction: column; gap: 8px; padding: 12px; }
.preview-bar { gap: 6px; flex-wrap: wrap; }
.preview-area { height: min(78vh, 760px); min-height: 460px; border-radius: 10px; background: var(--c-bg); }
.segmented { display: inline-flex; gap: 2px; padding: 2px; border: 1px solid var(--c-border); border-radius: 10px; }
.segmented button { border: 0; background: none; display: inline-flex; align-items: center; gap: 4px; }
.segmented button.active { background: var(--c-primary); color: #fff; }
.segmented .btn-icon { width: 34px; height: 34px; min-height: 34px; padding: 0; justify-content: center; }

.preview-dialog { display: flex; flex-direction: column; gap: 10px; flex: 1; min-height: 0; }
.preview-dialog .btn-small { display: inline-flex; align-items: center; gap: 4px; }
.preview-stage { flex: 1; min-height: 0; border-radius: 12px; background: color-mix(in srgb, var(--c-bg) 70%, #000 30%); }
@media (max-width: 599px) {
  .device-label { display: none; }
}
</style>
