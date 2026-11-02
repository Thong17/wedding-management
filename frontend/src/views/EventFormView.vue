<script setup lang="ts">
import axios from 'axios'
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { eventsApi } from '@/api/endpoints'
import { errorMessage } from '@/api/http'
import type { EventInput } from '@/api/types'
import AppDatePicker from '@/components/AppDatePicker.vue'

const props = defineProps<{ id?: string }>()
const router = useRouter()
const form = reactive<EventInput>({ name: '', date: new Date().toISOString().slice(0, 10), venue: '', currency: 'USD' })
const fieldErrors = ref<Record<string, string[]>>({})
const error = ref<string | null>(null)
const busy = ref(false)

onMounted(async () => {
  if (!props.id) return
  try {
    const e = await eventsApi.get(Number(props.id))
    Object.assign(form, { name: e.name, date: e.date, venue: e.venue, currency: e.currency })
  } catch (err) {
    error.value = errorMessage(err)
  }
})

async function save() {
  busy.value = true
  error.value = null
  fieldErrors.value = {}
  try {
    const saved = props.id ? await eventsApi.update(Number(props.id), form) : await eventsApi.create(form)
    router.push(`/events/${saved.id}`)
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 400) fieldErrors.value = err.response.data
    else error.value = errorMessage(err)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="container" style="max-width: 560px">
    <form class="card stack" @submit.prevent="save">
      <h1>{{ id ? 'Edit event' : 'New event' }}</h1>
      <label>Name <input v-model="form.name" required maxlength="200" />
        <span class="field-error" v-if="fieldErrors.name">{{ fieldErrors.name.join(' ') }}</span></label>
      <label>Date <AppDatePicker v-model="form.date" required />
        <span class="field-error" v-if="fieldErrors.date">{{ fieldErrors.date.join(' ') }}</span></label>
      <label>Venue <input v-model="form.venue" maxlength="255" /></label>
      <label>Currency (ISO code) <input v-model="form.currency" required maxlength="3" placeholder="USD" />
        <span class="field-error" v-if="fieldErrors.currency">{{ fieldErrors.currency.join(' ') }}</span></label>
      <p v-if="error" class="banner banner-danger">{{ error }}</p>
      <div class="row">
        <button class="btn-primary" :disabled="busy">Save</button>
        <button type="button" @click="router.back()">Cancel</button>
      </div>
    </form>
  </div>
</template>
