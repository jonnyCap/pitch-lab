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
  height: 160px;
  max-width: 640px;
  margin: 0 auto;
  padding: 0 3px 3px;
  user-select: none;
  touch-action: manipulation;
  perspective: 600px;
  perspective-origin: 50% -40%;
  background: var(--key-black);
  border-radius: 4px 4px 8px 8px;
  /* Key-slip felt. */
  border-top: 4px solid color-mix(in srgb, var(--accent) 75%, #000);
  box-shadow: var(--shadow);
}
button {
  font: inherit;
  cursor: pointer;
  padding: 0;
  transform-origin: 50% 0;
  transition:
    transform 0.09s var(--ease-out),
    box-shadow 0.09s var(--ease-out),
    background-color 0.15s;
}
button:disabled {
  cursor: default;
}
.white {
  flex: 1 1 0;
  min-width: 0;
  margin: 0 1px;
  background: linear-gradient(
    to bottom,
    color-mix(in srgb, var(--key-white) 88%, #000) 0,
    var(--key-white) 12%
  );
  border: 0;
  border-radius: 0 0 5px 5px;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding-bottom: 10px;
  color: #6b6a63;
  box-shadow:
    inset 0 -6px 0 color-mix(in srgb, var(--key-white) 82%, #000),
    inset 0 0 0 1px rgb(0 0 0 / 0.08);
}
.black {
  position: absolute;
  top: 0;
  height: 60%;
  background: linear-gradient(to bottom, #2a2a2c, var(--key-black) 70%, #3a3a3d 92%, #222 100%);
  border: 0;
  border-radius: 0 0 4px 4px;
  z-index: 1;
  box-shadow:
    inset 0 -5px 0 #454548,
    inset 1px 0 0 rgb(255 255 255 / 0.06),
    0 4px 6px rgb(0 0 0 / 0.35);
}
/* Pressed: the key pivots at the back and the front lip shrinks. */
.white:not(:disabled):active {
  transform: rotateX(-5deg);
  box-shadow:
    inset 0 -2px 0 color-mix(in srgb, var(--key-white) 82%, #000),
    inset 0 0 0 1px rgb(0 0 0 / 0.08),
    inset 0 18px 18px -14px rgb(0 0 0 / 0.25);
}
.black:not(:disabled):active {
  transform: rotateX(-7deg);
  box-shadow:
    inset 0 -2px 0 #454548,
    0 1px 2px rgb(0 0 0 / 0.35);
}
.correct {
  background: var(--ok) !important;
  color: var(--on-status) !important;
}
.wrong {
  background: var(--bad) !important;
  color: var(--on-status) !important;
}
.mark {
  background: var(--series) !important;
}
.c {
  font-family: var(--mono);
  font-size: 0.62rem;
}
</style>
