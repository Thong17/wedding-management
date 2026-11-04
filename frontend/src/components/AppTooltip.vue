<script setup lang="ts">
import { TooltipArrow, TooltipContent, TooltipPortal, TooltipRoot, TooltipTrigger } from 'reka-ui'

/**
 * A small tooltip on hover and keyboard focus, instead of the browser's plain `title`. Wrap exactly one
 * element (it becomes the trigger); with no text, the element is shown as is. Touch screens don't show
 * tooltips, so the element should also carry an aria-label or visible text.
 */
withDefaults(defineProps<{ text?: string | null; side?: 'top' | 'right' | 'bottom' | 'left' }>(), { side: 'top' })
</script>

<template>
  <TooltipRoot v-if="text">
    <TooltipTrigger as-child><slot /></TooltipTrigger>
    <TooltipPortal>
      <TooltipContent class="tooltip" :side="side" :side-offset="6" :collision-padding="8">
        {{ text }}
        <TooltipArrow class="tooltip-arrow" :width="10" :height="5" />
      </TooltipContent>
    </TooltipPortal>
  </TooltipRoot>
  <slot v-else />
</template>

<style>
/* Unscoped: the tooltip is portalled to <body>. Above dialogs and menus, below toasts. */
.tooltip {
  z-index: 45;
  max-width: min(280px, calc(100vw - 16px));
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  background: var(--c-text);
  color: var(--c-surface);
  font-size: 0.82rem;
  font-weight: 500;
  line-height: 1.35;
  box-shadow: 0 4px 14px rgb(0 0 0 / 0.18);
  overflow-wrap: anywhere;
  user-select: none;
}
.tooltip-arrow { fill: var(--c-text); }
.tooltip[data-state='delayed-open'],
.tooltip[data-state='instant-open'] { animation: tooltip-in 140ms ease-out; }
.tooltip[data-side='top'] { --tooltip-from: translateY(3px); }
.tooltip[data-side='bottom'] { --tooltip-from: translateY(-3px); }
.tooltip[data-side='left'] { --tooltip-from: translateX(3px); }
.tooltip[data-side='right'] { --tooltip-from: translateX(-3px); }
@keyframes tooltip-in {
  from { opacity: 0; transform: var(--tooltip-from, none); }
}
@media (prefers-reduced-motion: reduce) {
  .tooltip[data-state] { animation: none; }
}
</style>
