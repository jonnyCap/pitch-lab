<script setup lang="ts">
/**
 * 12-category pitch wheel (C at the top, clockwise) — the response format used
 * by Van Hedger et al. (2019). Keyboard: top-row keys 1 … 9, 0, -, = map to
 * C … B (Wong et al. 2020); N answers "not in my set". Uses pointerdown +
 * Event.timeStamp for accurate response times.
 */
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
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

// Neutral acknowledgement: a brief ink ring on the pressed key (never a correctness cue).
const acked = ref<WheelAnswer | null>(null)
let ackTimer: ReturnType<typeof setTimeout> | undefined
function ack(a: WheelAnswer) {
  acked.value = null
  void nextTick(() => {
    acked.value = a
    clearTimeout(ackTimer)
    ackTimer = setTimeout(() => (acked.value = null), 450)
  })
}

function choose(a: WheelAnswer, timeStamp: number) {
  if (props.disabled) return
  if (a === 'none' ? !props.allowNone : !props.options.includes(a)) return
  if (a !== 'none') aim(a)
  ack(a)
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
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  clearTimeout(ackTimer)
})

function position(pc: number) {
  const angle = (pc / 12) * 2 * Math.PI - Math.PI / 2
  return { left: `${50 + 40 * Math.cos(angle)}%`, top: `${50 + 40 * Math.sin(angle)}%` }
}

// Engraved blueprint ticks on the dial: 60 minor + 12 major, just inside the keys.
const ticks = Array.from({ length: 60 }, (_, i) => {
  const major = i % 5 === 0
  const a = (i / 60) * 2 * Math.PI - Math.PI / 2
  const r1 = 26.5
  const r0 = major ? 23.2 : 24.8
  return {
    i,
    major,
    x1: 50 + r0 * Math.cos(a),
    y1: 50 + r0 * Math.sin(a),
    x2: 50 + r1 * Math.cos(a),
    y2: 50 + r1 * Math.sin(a),
  }
})
</script>

<template>
  <div class="wrap">
    <div class="wheel" role="group" aria-label="Pitch names">
      <svg class="plate" viewBox="0 0 100 100" aria-hidden="true">
        <circle class="rim" cx="50" cy="50" r="49.4" />
        <circle class="guide" cx="50" cy="50" r="40" />
        <circle class="guide inner" cx="50" cy="50" r="22.4" />
        <line
          v-for="t in ticks"
          :key="t.i"
          :class="t.major ? 'tick major' : 'tick'"
          :x1="t.x1"
          :y1="t.y1"
          :x2="t.x2"
          :y2="t.y2"
        />
      </svg>
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
          ack: acked === pc,
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
      :class="{ correct: correct === 'none', wrong: wrong === 'none', ack: acked === 'none' }"
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
/* Dial plate: hairline rim, construction circles, engraved ticks. */
.plate {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
}
.rim {
  fill: var(--surface);
  stroke: var(--border);
  stroke-width: 0.35;
}
.guide {
  fill: none;
  stroke: var(--line);
  stroke-width: 0.3;
  stroke-dasharray: 0.8 1.6;
}
.guide.inner {
  stroke-dasharray: none;
}
.tick {
  stroke: var(--muted);
  stroke-width: 0.25;
  opacity: 0.55;
}
.tick.major {
  stroke: var(--text);
  stroke-width: 0.4;
  opacity: 0.8;
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
  opacity: 0.6;
  pointer-events: none;
}
.needle::before {
  content: '';
  position: absolute;
  left: 50%;
  top: -6px;
  width: 0;
  height: 0;
  transform: translateX(-50%);
  border: 5px solid transparent;
  border-top: 0;
  border-bottom: 8px solid var(--muted);
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

/* Keys: raised discs with ink hairline; dark mode uses the dark raised surface. */
.pc {
  position: absolute;
  width: 18.5%;
  aspect-ratio: 1;
  margin: -9.25% 0 0 -9.25%;
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
  transition:
    background-color 0.12s,
    border-color 0.12s,
    color 0.12s,
    transform 0.1s var(--ease-out),
    opacity 0.2s;
}
.pc.active {
  color: var(--text);
  border-color: var(--text);
}
.pc.active:not(:disabled):hover {
  border-color: var(--accent);
  color: var(--accent-ink);
}
.pc.active:not(:disabled):active {
  transform: scale(0.94);
  background: var(--accent-soft);
}
.pc:disabled {
  cursor: default;
}
.pc:not(.active) {
  opacity: 0.3;
}
.ack {
  animation: ack 0.42s var(--ease-out);
}
@keyframes ack {
  from {
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--text) 35%, transparent);
    transform: scale(0.94);
  }
  to {
    box-shadow: 0 0 0 10px transparent;
    transform: scale(1);
  }
}
.correct,
.wrong {
  color: var(--on-status) !important;
  opacity: 1 !important;
}
.correct {
  background: var(--ok) !important;
  border-color: var(--ok) !important;
}
.wrong {
  background: var(--bad) !important;
  border-color: var(--bad) !important;
}
.name {
  font-family: var(--display);
  font-weight: 400;
  font-size: clamp(1.15rem, 4.6vw, 1.5rem);
  letter-spacing: -0.01em;
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
.none.correct,
.none.wrong {
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
