<script setup lang="ts">
/**
 * Per-pitch accuracy as a 12-wedge radial chart: C at the top, clockwise, like
 * the answer wheel. Bar length = accuracy; the dashed ring marks the 90% pass mark.
 */
import { computed } from 'vue'
import { dur } from '@/lib/motion'
import { PITCH_CLASS_NAMES_SHARP, ALL_PITCH_CLASSES } from '@/music/pitch'
import type { PitchStat } from '@/ap/scoring'

const props = defineProps<{ perPitch: readonly PitchStat[]; pass?: number }>()

const C = 100
const R0 = 30
const R1 = 84
const stats = computed(() => new Map(props.perPitch.map((p) => [p.pitchClass, p])))
const pass = computed(() => props.pass ?? 0.9)

const wedges = computed(() =>
  ALL_PITCH_CLASSES.map((pc) => {
    const s = stats.value.get(pc)
    const a = (pc / 12) * 2 * Math.PI - Math.PI / 2
    const label = { x: C + 97 * Math.cos(a), y: C + 97 * Math.sin(a) }
    const acc = s ? s.accuracy : 0
    const tone = acc >= pass.value ? 'ok' : acc >= 0.6 ? 'mid' : 'low'
    return {
      pc,
      s,
      rot: pc * 30,
      len: R0 + Math.max(acc, s ? 0.03 : 0) * (R1 - R0),
      tone,
      label,
      title: s
        ? `${PITCH_CLASS_NAMES_SHARP[pc]}: ${s.correct} of ${s.n} correct`
        : `${PITCH_CLASS_NAMES_SHARP[pc]}: not in this level`,
    }
  }),
)
const d = dur(450)
</script>

<template>
  <svg class="radial" viewBox="-14 -14 228 228" role="img" aria-label="Accuracy per pitch">
    <circle class="ring" :cx="C" :cy="C" :r="R0" />
    <circle class="ring" :cx="C" :cy="C" :r="R1" />
    <circle class="ring pass" :cx="C" :cy="C" :r="R0 + pass * (R1 - R0)" />
    <g v-for="w in wedges" :key="w.pc" :transform="`translate(${C} ${C}) rotate(${w.rot})`">
      <line class="spoke" x1="0" :y1="-R0" x2="0" :y2="-R1" />
      <rect
        v-if="w.s"
        class="bar"
        :class="w.tone"
        x="-8.5"
        :y="-w.len"
        width="17"
        :height="w.len - R0"
        :style="{
          animationDuration: `${d}ms`,
          animationDelay: `${dur(w.pc * 40)}ms`,
          animationName: d ? undefined : 'none',
        }"
      >
        <title>{{ w.title }}</title>
      </rect>
      <rect v-else class="absent" x="-8.5" :y="-R1" width="17" :height="R1 - R0" />
    </g>
    <text
      v-for="w in wedges"
      :key="`t-${w.pc}`"
      class="lbl"
      :class="{ off: !w.s }"
      :x="w.label.x"
      :y="w.label.y"
      text-anchor="middle"
      dominant-baseline="central"
    >
      {{ PITCH_CLASS_NAMES_SHARP[w.pc] }}
    </text>
  </svg>
</template>

<style scoped>
.radial {
  width: 100%;
  max-width: 260px;
  height: auto;
  overflow: visible;
}
.ring {
  fill: none;
  stroke: var(--border);
  stroke-width: 0.5;
}
.ring.pass {
  stroke: var(--muted);
  stroke-dasharray: 1.5 2.5;
}
.spoke {
  stroke: var(--line);
  stroke-width: 0.4;
}
.bar {
  transform-origin: 0 0;
  animation: grow 0.45s var(--ease-out) both;
}
.bar.ok {
  fill: var(--ok);
}
.bar.mid {
  fill: var(--accent);
}
.bar.low {
  fill: var(--bad);
}
.absent {
  fill: none;
  stroke: var(--line);
  stroke-width: 0.5;
  stroke-dasharray: 1 2;
}
.lbl {
  font-family: var(--display);
  font-size: 11px;
  fill: var(--text);
}
.lbl.off {
  fill: var(--muted);
  opacity: 0.5;
}
@keyframes grow {
  from {
    transform: scaleY(0);
    opacity: 0;
  }
  to {
    transform: scaleY(1);
    opacity: 1;
  }
}
</style>
