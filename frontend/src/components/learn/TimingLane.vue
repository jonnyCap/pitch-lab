<script setup lang="ts">
/**
 * Result "timing lane": one tick per expected note (ideal time), your tap as a dot
 * offset early (left) or late (right) of it, coloured by accuracy. Missed notes are
 * hollow ticks with a cross. `beats` is the length of the pattern in beats.
 */
import { computed } from 'vue'

const props = defineProps<{
  /** Ideal onsets in beats from the start. */
  onsets: readonly number[]
  /** Signed error in ms per onset (null = missed). */
  errors: readonly (number | null)[]
  beatMs: number
  beats: number
}>()

const W = 640
const PAD = 16
const H = 96
const msToX = (ms: number) => PAD + (ms / (props.beats * props.beatMs)) * (W - 2 * PAD)

const notes = computed(() =>
  props.onsets.map((b, i) => {
    const err = props.errors[i] ?? null
    const ideal = msToX(b * props.beatMs)
    const abs = err === null ? null : Math.abs(err)
    return {
      i,
      ideal,
      tap: err === null ? null : msToX(b * props.beatMs + err),
      tone: abs === null ? 'miss' : abs <= 40 ? 'good' : abs <= 90 ? 'ok' : 'off',
      label: err === null ? 'missed' : `${err > 0 ? '+' : ''}${Math.round(err)} ms`,
    }
  }),
)
const grid = computed(() =>
  Array.from({ length: props.beats + 1 }, (_, b) => msToX(b * props.beatMs)),
)
</script>

<template>
  <figure class="lane">
    <svg
      :viewBox="`0 0 ${W} ${H}`"
      role="img"
      aria-label="Timing of each tap against the ideal time"
    >
      <g class="grid">
        <line
          v-for="(x, b) in grid"
          :key="`g-${b}`"
          :x1="x"
          :x2="x"
          y1="14"
          :y2="b % 4 === 0 ? 84 : 78"
          :class="{ bar: b % 4 === 0 }"
        />
      </g>
      <line class="axis" :x1="PAD" :x2="W - PAD" y1="46" y2="46" />
      <g v-for="n in notes" :key="`n-${n.i}`" class="note" :class="n.tone" :style="{ '--i': n.i }">
        <title>{{ n.label }}</title>
        <line class="tick" :x1="n.ideal" :x2="n.ideal" y1="30" y2="62" />
        <template v-if="n.tap !== null">
          <line class="link" :x1="n.ideal" :x2="n.tap" y1="46" y2="46" />
          <circle class="dot" :cx="n.tap" cy="46" r="6" />
        </template>
        <path v-else class="x" :d="`M${n.ideal - 5} 41l10 10M${n.ideal + 5} 41l-10 10`" />
      </g>
      <text x="16" y="94" class="cap">early</text>
      <text :x="W - 16" y="94" class="cap" text-anchor="end">late</text>
    </svg>
  </figure>
</template>

<style scoped>
.lane {
  margin: 0;
  width: 100%;
}
svg {
  display: block;
  width: 100%;
  height: auto;
  overflow: visible;
}
.grid line {
  stroke: var(--line);
  stroke-width: 1;
}
.grid line.bar {
  stroke: var(--border);
}
.axis {
  stroke: var(--border);
  stroke-width: 1;
}
.tick {
  stroke: var(--text);
  stroke-width: 1.5;
}
.link {
  stroke: currentColor;
  stroke-width: 1.5;
  opacity: 0.5;
}
.dot {
  fill: currentColor;
  stroke: var(--surface);
  stroke-width: 2;
}
.x {
  fill: none;
  stroke: var(--bad);
  stroke-width: 1.5;
}
.good {
  color: var(--ok);
}
.ok {
  color: var(--warn);
}
.off {
  color: var(--bad);
}
.cap {
  font-family: var(--serif);
  font-style: italic;
  font-size: 11px;
  fill: var(--muted);
}
.note .dot {
  transform-box: fill-box;
  transform-origin: center;
  animation: land 0.4s var(--ease-spring, ease-out) both;
  animation-delay: calc(var(--i) * 50ms);
}
@keyframes land {
  from {
    transform: scale(0);
    opacity: 0;
  }
}
</style>
