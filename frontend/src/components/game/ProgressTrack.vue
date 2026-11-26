<!--
  Segmented hairline progress. <ProgressTrack :total="12" :index="3" />
  `index` = 0-based current item (segments before it are complete).
  Pass `results` ONLY on feedback levels; without it completed segments are neutral ink.
  More than 48 segments render a continuous bar instead.
-->
<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  total: number
  index: number
  results?: ('ok' | 'bad' | null)[]
}>()

const MAX_SEGMENTS = 48
const segmented = computed(() => props.total > 0 && props.total <= MAX_SEGMENTS)
const done = computed(() => Math.max(0, Math.min(props.total, props.index)))
const segs = computed(() =>
  Array.from({ length: segmented.value ? props.total : 0 }, (_, i) => {
    const state = i < props.index ? 'done' : i === props.index ? 'current' : 'todo'
    const result = state === 'done' ? (props.results?.[i] ?? null) : null
    return { i, state, result }
  }),
)
</script>

<template>
  <div
    class="track"
    role="progressbar"
    aria-valuemin="0"
    :aria-valuemax="total"
    :aria-valuenow="done"
    :aria-valuetext="`${Math.min(done + 1, total)} of ${total}`"
  >
    <template v-if="segmented">
      <span
        v-for="s in segs"
        :key="`seg-${s.i}`"
        class="seg"
        :class="[s.state, s.result]"
        :data-state="s.state"
      />
    </template>
    <span v-else class="bar"
      ><span class="fill" :style="{ width: (done / total) * 100 + '%' }"
    /></span>
  </div>
</template>

<style scoped>
.track {
  display: flex;
  gap: 3px;
  width: 100%;
  height: 6px;
  align-items: stretch;
}
.seg {
  position: relative;
  flex: 1 1 0;
  min-width: 2px;
  background: var(--line, #e8e8e4);
  border-radius: 1px;
  overflow: hidden;
  transition: background 0.2s var(--ease-out, ease);
}
.seg::after {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--text, #0b0b0c);
  transform: scaleX(0);
  transform-origin: left;
  transition:
    transform 0.32s var(--ease-out, ease),
    background 0.2s var(--ease-out, ease);
}
.seg.done::after {
  transform: scaleX(1);
}
.seg.done.ok::after {
  background: var(--ok, #0b7a3e);
}
.seg.done.bad::after {
  background: var(--bad, #d1301c);
}
.seg.current {
  background: var(--accent-soft, rgb(30 64 255 / 0.12));
  box-shadow: inset 0 0 0 1px var(--accent, #1e40ff);
}
.bar {
  flex: 1;
  background: var(--line, #e8e8e4);
  border-radius: 1px;
  overflow: hidden;
}
.fill {
  display: block;
  height: 100%;
  background: var(--text, #0b0b0c);
  transition: width 0.32s var(--ease-out, ease);
}
</style>
