<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { PreviewDevice } from '@/invite/config'

/**
 * A device-sized screen for previewing the invitation: the slot is laid out at the real size of a
 * phone, tablet or desktop window (so its container queries see real widths), then scaled down to fit
 * the space available.
 */
const SIZES: Record<PreviewDevice, [number, number]> = {
  phone: [390, 844],
  tablet: [820, 1180],
  desktop: [1440, 900],
}

const props = defineProps<{ device: PreviewDevice }>()

const box = ref<HTMLElement | null>(null)
const available = ref<[number, number]>([0, 0])
let observer: ResizeObserver | null = null
onMounted(() => {
  if (!box.value) return
  const measure = () => box.value && (available.value = [box.value.clientWidth, box.value.clientHeight])
  measure()
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(measure)
    observer.observe(box.value)
  }
})
onBeforeUnmount(() => observer?.disconnect())

const size = computed(() => SIZES[props.device])
const scale = computed(() => {
  const [w, h] = size.value
  const [aw, ah] = available.value
  if (!aw || !ah) return 1
  return Math.min(1, (aw - 8) / (w + 20), (ah - 8) / (h + 20))
})
</script>

<template>
  <div ref="box" class="frame-box">
    <div
      class="device"
      :class="`device-${device}`"
      :style="{ width: `${size[0]}px`, height: `${size[1]}px`, transform: `scale(${scale})` }"
    >
      <div class="screen"><slot /></div>
    </div>
  </div>
</template>

<style scoped>
.frame-box {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.device {
  position: absolute;
  top: 50%;
  left: 50%;
  margin: 0;
  translate: -50% -50%;
  transform-origin: center;
  flex-shrink: 0;
  border-radius: 28px;
  padding: 10px;
  background: #16121a;
  box-shadow: 0 20px 60px rgb(0 0 0 / 0.35), inset 0 0 0 1px rgb(255 255 255 / 0.08);
  box-sizing: content-box;
}
.device-desktop { border-radius: 12px; padding: 8px; }
.screen { position: relative; width: 100%; height: 100%; overflow: hidden; border-radius: 20px; background: #000; }
.device-desktop .screen { border-radius: 6px; }
</style>
