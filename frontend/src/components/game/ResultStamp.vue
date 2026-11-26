<!--
  Rotated outline "stamp" that lands with a scale + blur-in. <ResultStamp text="Passed" tone="ok" />
-->
<script setup lang="ts">
import { computed } from 'vue'
import { dur } from '@/lib/motion'

const props = withDefaults(defineProps<{ text: string; tone?: 'ok' | 'bad' | 'ink' }>(), {
  tone: 'ink',
})
const color = computed(
  () => ({ ok: 'var(--ok)', bad: 'var(--bad)', ink: 'var(--text)' })[props.tone],
)
const style = computed(() => {
  const d = dur(520)
  return { color: color.value, animationDuration: `${d}ms`, animationName: d ? undefined : 'none' }
})
</script>

<template>
  <span class="stamp" :style="style">{{ text }}</span>
</template>

<style scoped>
.stamp {
  display: inline-block;
  padding: 0.35rem 1rem 0.3rem;
  border: 2px solid currentColor;
  border-radius: 3px;
  outline: 1px solid currentColor;
  outline-offset: 3px;
  font: 400 1.6rem/1 var(--serif, Georgia, serif);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  transform: rotate(-6deg);
  animation: stamp-in 0.52s var(--ease-spring, cubic-bezier(0.34, 1.56, 0.64, 1)) both;
  user-select: none;
}
@keyframes stamp-in {
  from {
    opacity: 0;
    transform: rotate(-12deg) scale(1.7);
    filter: blur(6px);
  }
  60% {
    opacity: 1;
    filter: blur(0);
  }
  to {
    opacity: 1;
    transform: rotate(-6deg) scale(1);
    filter: blur(0);
  }
}
</style>
