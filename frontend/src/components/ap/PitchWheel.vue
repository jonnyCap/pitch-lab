<script setup lang="ts">
/**
 * 12-category pitch wheel (C at the top, clockwise) — the response format used
 * by Van Hedger et al. (2019). Keyboard: top-row keys 1 … 9, 0, -, = map to
 * C … B (Wong et al. 2020). Uses pointerdown + Event.timeStamp for accurate RTs.
 */
import { onBeforeUnmount, onMounted } from 'vue'
import {
  ALL_PITCH_CLASSES,
  PITCH_CLASS_NAMES_FLAT,
  PITCH_CLASS_NAMES_SHARP,
  type PitchClass,
} from '@/music/pitch'

const props = defineProps<{
  options: readonly PitchClass[]
  disabled?: boolean
  /** Highlight after an answer: correct target and (if wrong) the chosen pitch. */
  correct?: PitchClass | null
  wrong?: PitchClass | null
}>()

const emit = defineEmits<{ answer: [pc: PitchClass, timeStamp: number] }>()

const KEY_CODES = [
  'Digit1',
  'Digit2',
  'Digit3',
  'Digit4',
  'Digit5',
  'Digit6',
  'Digit7',
  'Digit8',
  'Digit9',
  'Digit0',
  'Minus',
  'Equal',
]
const KEY_LABELS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=']

function choose(pc: PitchClass, timeStamp: number) {
  if (props.disabled || !props.options.includes(pc)) return
  emit('answer', pc, timeStamp)
}

function onKey(e: KeyboardEvent) {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
  const pc = KEY_CODES.indexOf(e.code)
  if (pc < 0) return
  e.preventDefault()
  choose(pc as PitchClass, e.timeStamp)
}

onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

function position(pc: number) {
  const angle = (pc / 12) * 2 * Math.PI - Math.PI / 2
  return { left: `${50 + 40 * Math.cos(angle)}%`, top: `${50 + 40 * Math.sin(angle)}%` }
}
</script>

<template>
  <div class="wheel" role="group" aria-label="Pitch names">
    <button
      v-for="pc in ALL_PITCH_CLASSES"
      :key="pc"
      type="button"
      class="pc"
      :class="{
        active: options.includes(pc),
        correct: correct === pc,
        wrong: wrong === pc,
      }"
      :style="position(pc)"
      :disabled="disabled || !options.includes(pc)"
      :aria-label="`${PITCH_CLASS_NAMES_SHARP[pc]} (key ${KEY_LABELS[pc]})`"
      @pointerdown.prevent="choose(pc, $event.timeStamp)"
    >
      <span class="name">{{ PITCH_CLASS_NAMES_SHARP[pc] }}</span>
      <span v-if="PITCH_CLASS_NAMES_FLAT[pc] !== PITCH_CLASS_NAMES_SHARP[pc]" class="alt">
        {{ PITCH_CLASS_NAMES_FLAT[pc] }}
      </span>
      <kbd class="key">{{ KEY_LABELS[pc] }}</kbd>
    </button>
    <div class="center"><slot /></div>
  </div>
</template>

<style scoped>
.wheel {
  position: relative;
  width: min(100%, 360px);
  aspect-ratio: 1;
  margin: 0 auto;
  user-select: none;
  touch-action: manipulation;
}
.pc {
  position: absolute;
  transform: translate(-50%, -50%);
  width: 19%;
  aspect-ratio: 1;
  border-radius: 50%;
  border: 2px solid var(--border);
  background: var(--surface);
  color: var(--muted);
  font: inherit;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  line-height: 1.1;
  cursor: pointer;
  transition:
    background 0.12s,
    border-color 0.12s,
    transform 0.08s;
}
.pc.active {
  color: var(--text);
  border-color: var(--accent);
}
.pc.active:not(:disabled):active {
  transform: translate(-50%, -50%) scale(0.94);
}
.pc:disabled {
  cursor: default;
}
.pc:not(.active) {
  opacity: 0.35;
}
.pc.correct {
  background: var(--ok);
  border-color: var(--ok);
  color: #fff;
  opacity: 1;
}
.pc.wrong {
  background: var(--bad);
  border-color: var(--bad);
  color: #fff;
  opacity: 1;
}
.name {
  font-weight: 700;
  font-size: clamp(0.9rem, 3.6vw, 1.15rem);
}
.alt {
  font-size: 0.7rem;
  opacity: 0.75;
}
.key {
  font-size: 0.6rem;
  opacity: 0.55;
  font-family: ui-monospace, monospace;
}
.center {
  position: absolute;
  inset: 26%;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
}
@media (hover: none) {
  .key {
    display: none;
  }
}
</style>
