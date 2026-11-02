<script setup lang="ts">
import { onMounted } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import { useEventsStore } from '@/stores/events'

const store = useEventsStore()
onMounted(() => store.load())
</script>

<template>
  <div class="container stack">
    <div class="row">
      <h1>Events</h1>
      <span class="spacer" />
      <RouterLink class="btn btn-primary" to="/events/new" v-if="!store.fromCache">+ New event</RouterLink>
    </div>
    <div v-if="store.fromCache" class="banner banner-info">Offline: showing events saved on this device.</div>
    <div v-if="store.error" class="banner banner-danger">{{ store.error }}</div>
    <p v-if="store.loading && !store.events.length" class="muted">Loading…</p>
    <p v-else-if="!store.events.length && !store.error" class="muted">No events yet. Create one to start.</p>
    <div class="events">
      <div v-for="e in store.events" :key="e.id" class="card stack event">
        <RouterLink class="btn btn-icon report" :to="`/events/${e.id}/report`" title="Report" aria-label="Report">
          <AppIcon name="chart" />
        </RouterLink>
        <div class="event-head">
          <h2>{{ e.name }}</h2>
          <div class="muted small">{{ e.date }}<span v-if="e.venue"> · {{ e.venue }}</span> · {{ e.currency }}</div>
        </div>
        <div class="row">
          <RouterLink class="btn btn-primary" :to="`/events/${e.id}/desk`"><AppIcon name="gift" />Open gift desk</RouterLink>
          <RouterLink class="btn" :to="`/events/${e.id}`"><AppIcon name="settings" />Manage</RouterLink>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.events { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); }
.event { position: relative; }
.report { position: absolute; top: 12px; right: 12px; width: 36px; min-height: 36px; height: 36px; border-radius: 50%; corner-shape: round; }
/* Keep the title and meta clear of the absolutely positioned report button. */
.event-head { padding-right: 44px; min-width: 0; overflow-wrap: anywhere; }
</style>
