<script setup lang="ts">
import axios from 'axios'
import { computed, onMounted, ref } from 'vue'
import { invitesApi } from '@/api/endpoints'
import type { ApiPublicInvite } from '@/api/types'
import InvitationView from '@/components/invite/InvitationView.vue'
import { withDefaults as fillDefaults } from '@/invite/config'
import { inviteLabels } from '@/invite/labels'

/** /e-invite/:slug — a published wedding invitation, for guests. No login, no app header. */
const props = defineProps<{ slug: string }>()

const invite = ref<ApiPublicInvite | null>(null)
const state = ref<'loading' | 'ready' | 'missing' | 'error'>('loading')
const config = computed(() => (invite.value ? fillDefaults(invite.value) : null))
// The not-found page has no invite language to follow: use the browser's.
const fallbackLabels = inviteLabels(navigator.language?.startsWith('km') ? 'km' : 'en')

async function load() {
  state.value = 'loading'
  try {
    invite.value = await invitesApi.public(props.slug)
    state.value = 'ready'
    const { partner1, partner2 } = invite.value.content
    const names = [partner1, partner2].filter(Boolean).join(' & ')
    document.title = names ? `${names} · ${inviteLabels(invite.value.content.language).invitation}` : inviteLabels(invite.value.content.language).invitation
    document.documentElement.lang = invite.value.content.language
  } catch (err) {
    state.value = axios.isAxiosError(err) && err.response?.status === 404 ? 'missing' : 'error'
  }
}
onMounted(load)
</script>

<template>
  <div class="public-invite">
    <InvitationView v-if="state === 'ready' && config" :config="config" :images="invite!.images" />
    <!-- While loading: the default cover color with a softly glowing seal, so the cover arrives seamlessly. -->
    <div v-else-if="state === 'loading'" class="placeholder" aria-busy="true">
      <span class="glow" />
    </div>
    <div v-else class="placeholder message" role="alert">
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
.glow {
  width: clamp(120px, 34vmin, 200px);
  aspect-ratio: 1;
  border-radius: 50%;
  background: radial-gradient(circle, rgb(243 223 166 / 0.55), rgb(201 161 74 / 0.15) 55%, transparent 70%);
  animation: glow 1.8s ease-in-out infinite;
}
@keyframes glow { 50% { transform: scale(1.08); opacity: 0.6; } }
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
@media (prefers-reduced-motion: reduce) {
  .glow { animation: none; }
}
</style>
