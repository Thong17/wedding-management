<script setup lang="ts">
import { parseDate, type DateValue } from '@internationalized/date'
import {
  DatePickerAnchor,
  DatePickerCalendar,
  DatePickerCell,
  DatePickerCellTrigger,
  DatePickerContent,
  DatePickerField,
  DatePickerGrid,
  DatePickerGridBody,
  DatePickerGridHead,
  DatePickerGridRow,
  DatePickerHeadCell,
  DatePickerHeader,
  DatePickerHeading,
  DatePickerInput,
  DatePickerNext,
  DatePickerPrev,
  DatePickerRoot,
  DatePickerTrigger,
} from 'reka-ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/AppIcon.vue'
import { intlLocale, type Locale } from '@/i18n'

/** ISO date string (YYYY-MM-DD), the same shape a native date input and the API use. */
const model = defineModel<string>({ default: '' })
defineProps<{ required?: boolean; name?: string }>()

const { t, locale: uiLocale } = useI18n()
// Segment order, month names and weekdays follow the chosen UI language.
const locale = computed(() => intlLocale(uiLocale.value as Locale))

const value = computed<DateValue | undefined>({
  get: () => {
    try {
      return model.value ? parseDate(model.value) : undefined
    } catch {
      return undefined
    }
  },
  set: (v) => (model.value = v ? v.toString() : ''),
})
</script>

<template>
  <DatePickerRoot v-model="value" :locale="locale" :required="required" :name="name" fixed-weeks>
    <!-- Anchor the calendar to the whole field, not just the icon button, so it opens directly below it. -->
    <DatePickerAnchor as-child>
      <DatePickerField v-slot="{ segments }" class="app-date">
        <div class="segments">
          <template v-for="item in segments" :key="item.part">
            <DatePickerInput v-if="item.part === 'literal'" :part="item.part" class="literal">{{ item.value }}</DatePickerInput>
            <DatePickerInput v-else :part="item.part" class="segment">{{ item.value }}</DatePickerInput>
          </template>
        </div>
        <DatePickerTrigger class="trigger" :aria-label="t('datePicker.open')"><AppIcon name="calendar" :size="18" /></DatePickerTrigger>
      </DatePickerField>
    </DatePickerAnchor>

    <DatePickerContent class="app-date-content" side="bottom" align="start" :side-offset="6">
      <DatePickerCalendar v-slot="{ weekDays, grid }">
        <DatePickerHeader class="cal-header">
          <DatePickerPrev class="nav" :aria-label="t('datePicker.prev')"><AppIcon name="chevron-left" :size="18" /></DatePickerPrev>
          <DatePickerHeading class="cal-heading" />
          <DatePickerNext class="nav" :aria-label="t('datePicker.next')"><AppIcon name="chevron-right" :size="18" /></DatePickerNext>
        </DatePickerHeader>
        <DatePickerGrid v-for="month in grid" :key="month.value.toString()" class="cal-grid">
          <DatePickerGridHead>
            <DatePickerGridRow class="cal-row">
              <DatePickerHeadCell v-for="day in weekDays" :key="day" class="cal-head">{{ day }}</DatePickerHeadCell>
            </DatePickerGridRow>
          </DatePickerGridHead>
          <DatePickerGridBody>
            <DatePickerGridRow v-for="(week, i) in month.rows" :key="i" class="cal-row">
              <DatePickerCell v-for="d in week" :key="d.toString()" :date="d">
                <DatePickerCellTrigger :day="d" :month="month.value" class="cal-day" />
              </DatePickerCell>
            </DatePickerGridRow>
          </DatePickerGridBody>
        </DatePickerGrid>
      </DatePickerCalendar>
    </DatePickerContent>
  </DatePickerRoot>
</template>

<style>
/* Unscoped: the calendar is portalled to <body>, outside this component's scope. */
.app-date {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 0 4px 0 12px;
  border: 1px solid var(--c-border);
  border-radius: var(--radius-md);
  background: var(--c-surface);
  color: var(--c-text);
  font-weight: 400;
}
.app-date:focus-within { outline: 2px solid var(--c-primary); outline-offset: 1px; }
.app-date .segments { display: flex; align-items: center; flex: 1; font-variant-numeric: tabular-nums; }
.app-date .segment { padding: 2px 3px; border-radius: 6px; outline: none; }
.app-date .segment:focus { background: var(--c-primary-soft); color: var(--c-primary); }
.app-date .segment[data-placeholder] { color: var(--c-muted); }
.app-date .literal { color: var(--c-muted); }
.app-date .trigger { min-height: 36px; width: 36px; padding: 0; border: none; background: none; color: var(--c-muted); }
.app-date .trigger:hover { color: var(--c-primary); }

.app-date-content {
  z-index: 40;
  padding: 12px;
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  border-radius: var(--radius);
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.12);
}
.app-date-content .cal-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.app-date-content .cal-heading { font-weight: 600; }
.app-date-content .nav { min-height: 36px; width: 36px; padding: 0; border-radius: 50%; corner-shape: round; }
.app-date-content .cal-grid { border-collapse: collapse; }
.app-date-content .cal-head { width: 40px; padding-bottom: 4px; font-size: 0.78rem; font-weight: 500; color: var(--c-muted); }
.app-date-content .cal-day {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  corner-shape: round;
  cursor: pointer;
  outline: none;
  font-variant-numeric: tabular-nums;
}
.app-date-content .cal-day:hover,
.app-date-content .cal-day[data-highlighted],
.app-date-content .cal-day:focus-visible { background: var(--c-primary-soft); }
.app-date-content .cal-day[data-today] { font-weight: 700; color: var(--c-primary); }
.app-date-content .cal-day[data-outside-view] { color: var(--c-muted); opacity: 0.5; }
.app-date-content .cal-day[data-selected] { background: var(--c-primary); color: var(--c-primary-ink); }
.app-date-content .cal-day[data-disabled] { opacity: 0.35; cursor: not-allowed; }
</style>
