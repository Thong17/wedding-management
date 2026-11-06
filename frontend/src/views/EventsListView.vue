<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import AppDialog from '@/components/AppDialog.vue'
import AppSkeleton from '@/components/AppSkeleton.vue'
import AppIcon from '@/components/AppIcon.vue'
import EventForm from '@/components/EventForm.vue'
import AppTooltip from '@/components/AppTooltip.vue'
import { useAuthStore } from '@/stores/auth'
import { useEventsStore } from '@/stores/events'
import { can } from '@/utils/permissions'

const store = useEventsStore()
const auth = useAuthStore()
const router = useRouter()
const { t } = useI18n()
const creating = ref(false)
onMounted(() => store.load())
</script>

<template>
  <div class="container stack">
    <div class="row">
      <h1>{{ t('events.title') }}</h1>
      <span class="spacer" />
      <button v-if="!store.fromCache && auth.isManager" class="btn-primary" @click="creating = true"><AppIcon name="plus" />{{ t('events.new') }}</button>
    </div>
    <AppDialog v-model:open="creating" :title="t('eventForm.newTitle')">
      <EventForm v-if="creating" @saved="(e) => router.push(`/events/${e.id}`)" @cancel="creating = false" />
    </AppDialog>
    <div v-if="store.fromCache" class="banner banner-info">{{ t('events.offline') }}</div>
    <div v-if="store.error" class="banner banner-danger">{{ store.error }}</div>
    <p v-if="!store.loading && !store.events.length && !store.error" class="muted">{{ t('events.empty') }}</p>
    <div class="events" :aria-busy="store.loading && !store.events.length">
      <template v-if="store.loading && !store.events.length">
        <div v-for="i in 3" :key="i" class="card event skeleton-appear"><AppSkeleton /></div>
      </template>
      <div v-for="e in store.events" :key="e.id" class="card stack event fade-in">
        <AppTooltip v-if="can(e, 'report_view')" :text="t('events.report')">
          <RouterLink class="btn btn-icon report" :to="`/events/${e.id}/report`" :aria-label="t('events.report')">
            <AppIcon name="chart" />
          </RouterLink>
        </AppTooltip>
        <div class="event-head">
          <h2>{{ e.name }}</h2>
          <div class="muted small">{{ e.date }}<span v-if="e.venue"> · {{ e.venue }}</span> · {{ e.currency }}</div>
        </div>
        <div class="row">
          <RouterLink v-if="can(e, 'gift_desk')" class="btn btn-primary" :to="`/events/${e.id}/desk`"><AppIcon name="gift" />{{ t('events.openDesk') }}</RouterLink>
          <RouterLink class="btn" :to="`/events/${e.id}`"><AppIcon name="settings" />{{ t('events.manage') }}</RouterLink>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Cards grow from 370px up to 500px; any leftover space in a row stays at the end. */
.events { display: flex; flex-wrap: wrap; gap: 12px; }
.event { position: relative; flex: 1 1 370px; min-width: min(370px, 100%); max-width: 500px; }
.report { position: absolute; top: 12px; right: 12px; width: 36px; min-height: 36px; height: 36px; border-radius: 50%; corner-shape: round; }
/* Keep the title and meta clear of the absolutely positioned report button. */
.event-head { padding-right: 44px; min-width: 0; overflow-wrap: anywhere; }
</style>
