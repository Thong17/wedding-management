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
import AppTooltip from '@/components/AppTooltip.vue'
import { LOCALES, setLocale, type Locale } from '@/i18n'

const { t, locale } = useI18n()
const current = computed({
  get: () => locale.value as Locale,
  set: (l: Locale) => setLocale(l),
})
</script>

<template>
  <!-- The tooltip wraps the whole menu: inside it, the menu's button would anchor to the tooltip
       instead of the menu, and the menu would never open. -->
  <AppTooltip :text="t('lang.label')" side="bottom">
    <span class="menu-tooltip-anchor">
      <DropdownMenuRoot>
        <DropdownMenuTrigger class="btn menu-trigger" :aria-label="t('lang.label')">
          <AppIcon name="globe" />
        </DropdownMenuTrigger>
        <DropdownMenuPortal>
          <DropdownMenuContent class="menu" align="end" :side-offset="6">
            <DropdownMenuRadioGroup v-model="current">
              <!-- Each language is written in itself, so it can be found whatever the current language is. -->
              <DropdownMenuRadioItem v-for="l in LOCALES" :key="l" :value="l" :lang="l" class="menu-item">
                {{ t(`lang.${l}`) }}
                <DropdownMenuItemIndicator class="indicator"><AppIcon name="check" :size="16" /></DropdownMenuItemIndicator>
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenuRoot>
    </span>
  </AppTooltip>
</template>
