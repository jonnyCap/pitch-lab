<script setup lang="ts">
/**
 * Visual metronome: four dots that light up on the beat (accent on beat 1).
 * `beat` is the running beat counter (0-based) or -1 when idle.
 */
defineProps<{ beat: number }>()
</script>

<template>
  <div class="dots" role="presentation" :data-beat="beat < 0 ? undefined : (beat % 4) + 1">
    <span
      v-for="i in 4"
      :key="`dot-${i}`"
      class="dot"
      :class="{ first: i === 1, on: beat >= 0 && beat % 4 === i - 1 }"
    />
  </div>
</template>

<style scoped>
.dots {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1.1rem;
  height: 1.6rem;
}
.dot {
  width: 0.7rem;
  height: 0.7rem;
  border-radius: 50%;
  border: 1px solid var(--muted);
  transition:
    transform 0.14s var(--ease-out),
    background-color 0.14s,
    border-color 0.14s;
}
.dot.first {
  width: 0.95rem;
  height: 0.95rem;
  border-color: var(--text);
}
.dot.on {
  background: var(--text);
  border-color: var(--text);
  transform: scale(1.35);
}
.dot.first.on {
  background: var(--accent);
  border-color: var(--accent);
  transform: scale(1.5);
}
</style>
