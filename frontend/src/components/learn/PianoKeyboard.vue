<script setup lang="ts">
/**
 * Playable piano keyboard (white + black keys) for a MIDI range starting on a
 * white key. Emits the pressed key with its event timestamp; the parent decides
 * what to play. Highlights show correct / wrong answers or marked keys.
 */
import { computed } from 'vue'

export interface KeyHighlight {
  midi: number
  kind: 'correct' | 'wrong' | 'mark'
}

const props = defineProps<{
  lo: number
  hi: number
  highlights?: readonly KeyHighlight[]
  disabled?: boolean
  /** Label C keys with their octave (C3, C4 …). */
  labelC?: boolean
}>()
const emit = defineEmits<{ press: [midi: number, timeStamp: number] }>()

const BLACK = new Set([1, 3, 6, 8, 10])
const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']

const whites = computed(() => {
  const out: number[] = []
  for (let m = props.lo; m <= props.hi; m++) if (!BLACK.has(m % 12)) out.push(m)
  return out
})
const blacks = computed(() => {
  const out: { midi: number; left: number }[] = []
  const w = 100 / whites.value.length
  for (let m = props.lo; m <= props.hi; m++) {
    if (!BLACK.has(m % 12)) continue
    const leftWhite = whites.value.indexOf(m - 1)
    if (leftWhite < 0) continue
    out.push({ midi: m, left: (leftWhite + 1) * w - w * 0.3 })
  }
  return out
})
const blackWidth = computed(() => (100 / whites.value.length) * 0.6)

function hl(midi: number): string | undefined {
  return props.highlights?.find((h) => h.midi === midi)?.kind
}
function label(midi: number): string {
  return `${NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`
}
function press(midi: number, e: PointerEvent) {
  if (props.disabled) return
  emit('press', midi, e.timeStamp)
}
</script>

<template>
  <div class="keyboard" role="group" aria-label="Piano keyboard">
    <button
      v-for="m in whites"
      :key="m"
      type="button"
      class="white"
      :class="hl(m)"
      :data-midi="m"
      :aria-label="label(m)"
      :disabled="disabled"
      @pointerdown.prevent="press(m, $event)"
    >
      <span v-if="labelC && m % 12 === 0" class="c">{{ label(m) }}</span>
    </button>
    <button
      v-for="b in blacks"
      :key="b.midi"
      type="button"
      class="black"
      :class="hl(b.midi)"
      :data-midi="b.midi"
      :aria-label="label(b.midi)"
      :disabled="disabled"
      :style="{ left: `${b.left}%`, width: `${blackWidth}%` }"
      @pointerdown.prevent="press(b.midi, $event)"
    />
  </div>
</template>

<style scoped>
.keyboard {
  position: relative;
  display: flex;
  width: 100%;
  height: 150px;
  max-width: 640px;
  margin: 0 auto;
  user-select: none;
  touch-action: manipulation;
}
button {
  font: inherit;
  cursor: pointer;
  padding: 0;
}
button:disabled {
  cursor: default;
}
.white {
  flex: 1 1 0;
  min-width: 0;
  background: #fff;
  border: 1px solid #94a3b8;
  border-radius: 0 0 6px 6px;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding-bottom: 6px;
  color: #475569;
}
.black {
  position: absolute;
  top: 0;
  height: 60%;
  background: #1e293b;
  border: 1px solid #0f172a;
  border-radius: 0 0 4px 4px;
  z-index: 1;
}
.white:not(:disabled):active {
  background: #e2e8f0;
}
.black:not(:disabled):active {
  background: #334155;
}
.correct {
  background: var(--ok) !important;
  border-color: var(--ok) !important;
}
.wrong {
  background: var(--bad) !important;
  border-color: var(--bad) !important;
}
.mark {
  background: var(--series) !important;
}
.c {
  font-size: 0.65rem;
}
</style>
