<script setup lang="ts">
/**
 * Calm concentric rings that expand from the centre while a note plays.
 * Purely decorative (aria-hidden, no pointer events); CSS only.
 */
defineProps<{ active?: boolean }>()
</script>

<template>
  <span class="ripple" :class="{ on: active }" aria-hidden="true">
    <i v-for="n in 3" :key="`r-${n}`" :style="{ animationDelay: `${(n - 1) * 0.8}s` }" />
  </span>
</template>

<style scoped>
.ripple {
  position: absolute;
  inset: -6%;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.2s;
}
.ripple.on {
  opacity: 1;
}
i {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 1px solid var(--accent);
  opacity: 0;
  transform: scale(0.35);
}
.on i {
  animation: ripple 2.4s var(--ease-out) infinite;
}
@keyframes ripple {
  0% {
    opacity: 0.55;
    transform: scale(0.35);
  }
  100% {
    opacity: 0;
    transform: scale(1);
  }
}
@media (prefers-reduced-motion: reduce) {
  .on i {
    animation: none;
    opacity: 0.25;
    transform: scale(0.7);
  }
}
</style>
