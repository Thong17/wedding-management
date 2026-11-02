<script setup lang="ts">
import {
  DropdownMenuContent,
  DropdownMenuItemIndicator,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuRoot,
  DropdownMenuTrigger,
} from 'reka-ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/AppIcon.vue'
import { setTheme, SWATCHES, theme, THEMES, type Theme } from '@/theme'

const { t } = useI18n()
const current = computed({
  get: () => theme.value,
  set: (value: Theme) => setTheme(value),
})
</script>

<template>
  <DropdownMenuRoot>
    <DropdownMenuTrigger class="btn menu-trigger" :title="t('theme.label')" :aria-label="t('theme.label')">
      <AppIcon name="palette" />
    </DropdownMenuTrigger>
    <DropdownMenuPortal>
      <DropdownMenuContent class="menu" align="end" :side-offset="6">
        <DropdownMenuRadioGroup v-model="current">
          <DropdownMenuRadioItem v-for="name in THEMES" :key="name" :value="name" class="menu-item">
            <!-- Fixed colors, so each swatch previews its own theme whatever theme is active. -->
            <span class="swatch" :style="{ background: SWATCHES[name].bg, '--accent': SWATCHES[name].accent }" aria-hidden="true" />
            {{ t(`theme.${name}`) }}
            <DropdownMenuItemIndicator class="indicator"><AppIcon name="check" :size="16" /></DropdownMenuItemIndicator>
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>

<style scoped>
.swatch {
  position: relative;
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  border-radius: 50%;
  corner-shape: round;
  border: 1px solid var(--c-border);
  overflow: hidden;
}
/* Accent fills the lower-right half: background + accent at a glance. */
.swatch::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, transparent 50%, var(--accent) 50%);
}
</style>
