<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/AppIcon.vue'
import AppTooltip from '@/components/AppTooltip.vue'

// "Gift recorded" next to a guest. Phones show only the check; the text stays as tooltip and label.
const { t } = useI18n()
</script>

<template>
  <AppTooltip :text="t('search.giftedTitle')">
    <span class="badge badge-synced gifted-badge" :aria-label="t('search.gifted')">
      <AppIcon name="check" :size="14" />
      <span class="gifted-text">{{ t('search.gifted') }}</span>
    </span>
  </AppTooltip>
</template>

<style scoped>
.gifted-badge { display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0; }

@media (max-width: 599px) {
  .gifted-text { display: none; }
  .gifted-badge { width: 26px; height: 26px; padding: 0; justify-content: center; border-radius: 50%; corner-shape: round; }
}
</style>
