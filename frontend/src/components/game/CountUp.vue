<!--
  Animated number. <CountUp :value="87.5" :decimals="1" suffix="%" />
  Animates from 0 (first mount) or from the previous value; the final value is
  always available to screen readers via a visually hidden span.
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { dur } from '@/lib/motion'

const props = withDefaults(
  defineProps<{
    value: number
    duration?: number
    decimals?: number
    suffix?: string
    prefix?: string
  }>(),
  { duration: 900, decimals: 0, suffix: '', prefix: '' },
)

const shown = ref(0)
let raf = 0

function format(n: number): string {
  return `${props.prefix}${n.toFixed(props.decimals)}${props.suffix}`
}
const final = computed(() => format(props.value))
const text = computed(() => format(shown.value))

function animateTo(target: number) {
  cancelAnimationFrame(raf)
  const from = shown.value
  const d = dur(props.duration)
  if (d <= 0 || from === target) {
    shown.value = target
    return
  }
  const t0 = performance.now()
  const step = (now: number) => {
    const t = Math.min(1, (now - t0) / d)
    const eased = 1 - Math.pow(1 - t, 4)
    shown.value = from + (target - from) * eased
    if (t < 1) raf = requestAnimationFrame(step)
  }
  raf = requestAnimationFrame(step)
}

onMounted(() => animateTo(props.value))
watch(() => props.value, animateTo)
onBeforeUnmount(() => cancelAnimationFrame(raf))
</script>

<template>
  <span class="countup">
    <span class="countup-vis" aria-hidden="true">{{ text }}</span>
    <span class="countup-sr">{{ final }}</span>
  </span>
</template>

<style scoped>
.countup {
  display: inline-block;
  font-variant-numeric: tabular-nums;
}
.countup-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>
