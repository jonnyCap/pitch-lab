<script setup lang="ts">
/**
 * 12-category pitch wheel (C at the top, clockwise) — the response format used
 * by Van Hedger et al. (2019). Keyboard: top-row keys 1 … 9, 0, -, = map to
 * C … B (Wong et al. 2020); N answers "not in my set". Uses pointerdown +
 * Event.timeStamp for accurate response times.
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  ALL_PITCH_CLASSES,
  PITCH_CLASS_NAMES_FLAT,
  PITCH_CLASS_NAMES_SHARP,
  type PitchClass,
} from '@/music/pitch'

export type WheelAnswer = PitchClass | 'none'

const props = defineProps<{
  options: readonly PitchClass[]
  /** Show the "not in my set" answer. */
  allowNone?: boolean
  disabled?: boolean
  /** Highlight after an answer: the correct answer and (if wrong) the chosen one. */
  correct?: WheelAnswer | null
  wrong?: WheelAnswer | null
}>()

const emit = defineEmits<{ answer: [answer: WheelAnswer, timeStamp: number] }>()

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

// Dial indicator: swings to the last answer, then to the correct one on feedback.
// Cumulative angle so it always takes the short way round.
const needleDeg = ref(0)
const needleOn = ref(false)
function aim(pc: number) {
  const cur = ((needleDeg.value % 360) + 360) % 360
  needleDeg.value += ((pc * 30 - cur + 540) % 360) - 180
  needleOn.value = true
}
watch(
  () => props.correct,
  (c) => {
    if (typeof c === 'number') aim(c)
  },
)

function choose(a: WheelAnswer, timeStamp: number) {
  if (props.disabled) return
  if (a === 'none' ? !props.allowNone : !props.options.includes(a)) return
  if (a !== 'none') aim(a)
  emit('answer', a, timeStamp)
}

function onKey(e: KeyboardEvent) {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
  if (e.code === 'KeyN') {
    if (!props.allowNone) return
    e.preventDefault()
    choose('none', e.timeStamp)
    return
  }
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
  <div class="wrap">
    <div class="wheel" role="group" aria-label="Pitch names">
      <div class="plate" aria-hidden="true" />
      <div
        class="needle"
        :class="{
          on: needleOn && disabled,
          ok: typeof correct === 'number',
          bad: typeof correct === 'number' && wrong != null,
        }"
        :style="{ transform: `rotate(${needleDeg}deg)` }"
        aria-hidden="true"
      />
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
    <button
      v-if="allowNone"
      type="button"
      class="btn none"
      :class="{ correct: correct === 'none', wrong: wrong === 'none' }"
      :disabled="disabled"
      aria-label="Not in my set (key N)"
      @pointerdown.prevent="choose('none', $event.timeStamp)"
    >
      Not in my set <kbd class="key">N</kbd>
    </button>
  </div>
</template>

<style scoped>
.wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}
.wheel {
  position: relative;
  width: min(100%, 380px);
  aspect-ratio: 1;
  margin: 0 auto;
  user-select: none;
  touch-action: manipulation;
}
/* Dial plate: 1px rim + 60 minor / 12 major engraved ticks. */
.plate {
  position: absolute;
  inset: 1%;
  border-radius: 50%;
  border: 1px solid var(--border);
  background:
    radial-gradient(circle, var(--surface) 0 57%, transparent 57.3%),
    repeating-conic-gradient(from -0.75deg, var(--muted) 0 1.5deg, transparent 1.5deg 30deg),
    repeating-conic-gradient(from -0.3deg, var(--border) 0 0.6deg, transparent 0.6deg 6deg),
    var(--surface);
  -webkit-mask: radial-gradient(circle, #000 0 61.5%, transparent 61.8% 64%, #000 64.3%);
  mask: radial-gradient(circle, #000 0 61.5%, transparent 61.8% 64%, #000 64.3%);
  box-shadow: var(--shadow);
}
/* Indicator: a ring + pointer that springs to the answer. */
.needle {
  position: absolute;
  inset: 21%;
  border-radius: 50%;
  border: 1px solid var(--line);
  transition:
    transform 0.6s var(--ease-spring),
    opacity 0.25s;
  opacity: 0.5;
  pointer-events: none;
}
.needle::before {
  content: '';
  position: absolute;
  left: 50%;
  top: -7px;
  width: 0;
  height: 0;
  transform: translateX(-50%);
  border: 7px solid transparent;
  border-top: 0;
  border-bottom: 10px solid var(--muted);
  opacity: 0;
  transition:
    border-color 0.2s,
    opacity 0.2s;
}
.needle.on::before {
  opacity: 1;
}
.needle.ok,
.needle.bad {
  opacity: 1;
}
.needle.ok::before {
  border-bottom-color: var(--ok);
}
.needle.bad {
  border-color: color-mix(in srgb, var(--bad) 60%, transparent);
}

/* Keycaps. */
.pc {
  --lip: 3px;
  position: absolute;
  transform: translate(-50%, -50%);
  width: 18.5%;
  aspect-ratio: 1;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: var(--raised);
  color: var(--muted);
  font: inherit;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  line-height: 1.05;
  cursor: pointer;
  box-shadow: 0 var(--lip) 0 var(--key-shadow);
  transition:
    background-color 0.12s,
    border-color 0.12s,
    color 0.12s,
    box-shadow 0.08s var(--ease-out),
    transform 0.08s var(--ease-out),
    opacity 0.2s;
}
.pc.active {
  color: var(--text);
  border-color: var(--muted);
}
.pc.active:not(:disabled):hover {
  border-color: var(--accent);
}
.pc.active:not(:disabled):active {
  transform: translate(-50%, calc(-50% + var(--lip)));
  box-shadow: 0 0 0 var(--key-shadow);
  background: var(--accent-soft);
}
.pc:disabled {
  cursor: default;
}
.pc:not(.active) {
  opacity: 0.3;
  box-shadow: none;
}
.correct,
.wrong {
  color: var(--on-status) !important;
  opacity: 1 !important;
}
.correct {
  background: var(--ok) !important;
  border-color: var(--ok) !important;
  box-shadow: 0 0 0 0 var(--ok);
  animation: ring 0.7s var(--ease-out);
}
.wrong {
  background: var(--bad) !important;
  border-color: var(--bad) !important;
  animation: shake 0.32s var(--ease-out);
}
@keyframes ring {
  from {
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--ok) 55%, transparent);
  }
  to {
    box-shadow: 0 0 0 14px transparent;
  }
}
@keyframes shake {
  25% {
    margin-left: -3px;
  }
  60% {
    margin-left: 3px;
  }
}
.name {
  font-weight: 650;
  font-size: clamp(0.95rem, 3.8vw, 1.2rem);
  letter-spacing: -0.02em;
}
.alt {
  font-size: 0.68rem;
  opacity: 0.7;
}
.key {
  font-size: 0.58rem;
  opacity: 0.5;
  font-family: var(--mono);
  margin-top: 1px;
}
.none {
  min-width: 12rem;
  touch-action: manipulation;
}
.none.correct {
  animation: none;
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
