<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { ApiPublicInvite } from '@/api/types'
import InvitationView from '@/components/invite/InvitationView.vue'
import InviteLoader from '@/components/invite/InviteLoader.vue'
import { viewIn, withDefaults as fillDefaults } from '@/invite/config'
import { inviteLabels } from '@/invite/labels'
import { fetchInvite, firstAssets, forget, isNotFound, preloadImage, readSaved, save } from '@/invite/load'

/** /e-invite/:slug — a published wedding invitation, for guests. No login, no app header. */
const props = defineProps<{ slug: string }>()

const invite = ref<ApiPublicInvite | null>(null)
const state = ref<'loading' | 'ready' | 'missing' | 'error'>('loading')
const config = computed(() => (invite.value ? fillDefaults(invite.value) : null))
// Before the invitation arrives (and on the not-found page) there is no invite language: use the browser's.
const fallbackLabels = inviteLabels(navigator.language?.startsWith('km') ? 'km' : 'en')
// The loader takes the cover's color when this invitation was seen before (as index.html's does).
const savedCover = readSaved(props.slug)?.animation?.cover_color

// Progress for the loader: each step has a share of the ring. While a step runs, the ring creeps toward
// the end of its share, so it always moves; when it finishes, the ring catches up.
const progress = ref(0)
let reached = 0 // finished steps
let ceiling = 0 // how far the running step may creep
let creep = 0
const ticker = setInterval(() => {
  creep += (ceiling - creep) * 0.03
  const goal = Math.max(reached, creep)
  if (goal > progress.value) progress.value += (goal - progress.value) * 0.3
}, 60)
onBeforeUnmount(() => clearInterval(ticker))
const begin = (share: number) => (ceiling = reached + share * 0.9)
const finish = (share: number) => (reached = Math.min(1, reached + share))
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const FETCH_SHARE = 0.35
/** At most this long for fonts and pictures: then the invitation shows with whatever is ready. */
const PREPARE_LIMIT_MS = 12_000

async function prepare(data: ApiPublicInvite) {
  const { fonts, images } = firstAssets(data)
  const share = (1 - reached) / (1 + images.length)
  begin(1 - reached)
  const steps = [fonts().then(() => finish(share)), ...images.map((url) => preloadImage(url).then(() => finish(share)))]
  await Promise.race([Promise.all(steps), sleep(PREPARE_LIMIT_MS)])
  reached = 1
  await sleep(300) // let the ring close
}

function show(data: ApiPublicInvite) {
  invite.value = data
  state.value = 'ready'
  const config = fillDefaults(data)
  const language = config.content.language
  const labels = inviteLabels(language)
  const view = viewIn(config, language)
  const names = [view.partner1, view.partner2].filter(Boolean).join(' & ')
  document.title = names ? `${names} · ${labels.invitation}` : labels.invitation
  document.documentElement.lang = language
}

/** A saved copy was shown: get the latest, quietly. Unpublished meanwhile → not found. */
async function revalidate() {
  try {
    const fresh = await fetchInvite(props.slug, { attempts: 2 })
    save(props.slug, fresh)
    if (JSON.stringify(fresh) !== JSON.stringify(invite.value)) invite.value = fresh
  } catch (err) {
    if (isNotFound(err)) {
      forget(props.slug)
      state.value = 'missing'
    }
  }
}

async function load() {
  state.value = 'loading'
  progress.value = reached = ceiling = creep = 0
  const saved = readSaved(props.slug)
  let data = saved
  if (!data) {
    begin(FETCH_SHARE)
    try {
      data = await fetchInvite(props.slug)
    } catch (err) {
      if (isNotFound(err)) forget(props.slug)
      state.value = isNotFound(err) ? 'missing' : 'error'
      return
    }
    save(props.slug, data)
  }
  finish(FETCH_SHARE)
  await prepare(data)
  show(data)
  if (saved) void revalidate()
}

onMounted(() => {
  // The loader index.html shows before the app has loaded; this page's own loader takes over now.
  document.getElementById('invite-boot')?.remove()
  void load()
})
</script>

<template>
  <div class="public-invite">
    <Transition name="reveal">
      <InvitationView v-if="state === 'ready' && config" :config="config" :images="invite!.images" :event="invite!.event" />
    </Transition>
    <!-- While loading: a gold ring filling as the invitation, its fonts and first pictures arrive. -->
    <Transition name="loader">
      <InviteLoader v-if="state === 'loading'" :progress="progress" :label="fallbackLabels.preparing" :color="savedCover" />
    </Transition>
    <div v-if="state === 'missing' || state === 'error'" class="placeholder message" role="alert">
      <svg class="mark" viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="32" r="29" fill="none" stroke="currentColor" stroke-width="1.5" />
        <path d="M32 44c-8-5-13-9.5-13-15.5a6.5 6.5 0 0 1 13-2.5 6.5 6.5 0 0 1 13 2.5c0 6-5 10.5-13 15.5z" fill="currentColor" />
      </svg>
      <h1>{{ state === 'missing' ? fallbackLabels.notFoundTitle : fallbackLabels.errorTitle }}</h1>
      <p v-if="state === 'missing'">{{ fallbackLabels.notFoundText }}</p>
      <p v-else>
        {{ fallbackLabels.errorText }}
        <button type="button" class="retry" @click="load">{{ fallbackLabels.retry }}</button>
      </p>
    </div>
  </div>
</template>

<style scoped>
.public-invite { position: fixed; inset: 0; height: 100dvh; background: #6e1423; }
.placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 24px;
  text-align: center;
  color: #f3dfa6;
  background:
    radial-gradient(ellipse at 50% 42%, rgb(255 255 255 / 0.12), transparent 60%),
    radial-gradient(ellipse at 50% 120%, rgb(0 0 0 / 0.45), transparent 60%),
    #6e1423;
  font-family: Georgia, 'Times New Roman', serif;
}
/* The loader fades out over the cover as it appears. */
.loader-leave-active { transition: opacity 0.6s ease; z-index: 2; }
.loader-leave-to { opacity: 0; }
.reveal-enter-active { transition: opacity 0.4s ease; }
.reveal-enter-from { opacity: 0; }
.mark { width: 64px; height: 64px; }
.message h1 { margin: 0; font-weight: 500; font-size: clamp(1.5rem, 6vw, 2.2rem); letter-spacing: 0.02em; }
.message p { margin: 0; max-width: 28em; opacity: 0.85; line-height: 1.6; }
.retry {
  display: block;
  margin: 14px auto 0;
  color: #6e1423;
  background: #f3dfa6;
  border: 0;
  border-radius: 999px;
  padding: 8px 20px;
  min-height: 40px;
}
</style>
