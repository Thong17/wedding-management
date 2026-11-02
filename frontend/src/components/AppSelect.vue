<script setup lang="ts" generic="T extends string">
import {
  SelectContent,
  SelectIcon,
  SelectItem,
  SelectItemIndicator,
  SelectItemText,
  SelectPortal,
  SelectRoot,
  SelectTrigger,
  SelectValue,
  SelectViewport,
} from 'reka-ui'
import AppIcon from '@/components/AppIcon.vue'

const model = defineModel<T>({ required: true })
defineProps<{ options: { value: T; label: string }[]; placeholder?: string; ariaLabel?: string; inline?: boolean }>()
</script>

<template>
  <SelectRoot v-model="model">
    <SelectTrigger class="app-select" :class="{ inline }" :aria-label="ariaLabel">
      <SelectValue :placeholder="placeholder" />
      <SelectIcon as-child><AppIcon name="chevron-down" :size="16" class="chev" /></SelectIcon>
    </SelectTrigger>
    <SelectPortal>
      <SelectContent class="app-select-content" position="popper" :side-offset="6">
        <SelectViewport class="app-select-viewport">
          <SelectItem v-for="o in options" :key="o.value" :value="o.value" class="app-select-item">
            <SelectItemText>{{ o.label }}</SelectItemText>
            <SelectItemIndicator class="indicator"><AppIcon name="check" :size="16" /></SelectItemIndicator>
          </SelectItem>
        </SelectViewport>
      </SelectContent>
    </SelectPortal>
  </SelectRoot>
</template>

<style>
/* Unscoped: the dropdown is portalled to <body>, outside this component's scope. */
.app-select {
  justify-content: space-between;
  width: 100%;
  font-weight: 400;
  padding: 10px 12px;
  text-align: left;
}
.app-select.inline { width: auto; }
.app-select[data-placeholder] { color: var(--c-muted); }
.app-select .chev { color: var(--c-muted); flex-shrink: 0; transition: transform 0.15s; }
.app-select[data-state='open'] .chev { transform: rotate(180deg); }

.app-select-content {
  z-index: 40;
  min-width: var(--reka-select-trigger-width);
  max-height: var(--reka-select-content-available-height);
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  border-radius: var(--radius-md);
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.12);
  overflow: hidden;
}
.app-select-viewport { padding: 4px; }
.app-select-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 40px;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  outline: none;
  user-select: none;
}
.app-select-item[data-highlighted] { background: var(--c-primary-soft); }
.app-select-item[data-state='checked'] { color: var(--c-primary); font-weight: 600; }
.app-select-item .indicator { display: inline-flex; }
</style>
