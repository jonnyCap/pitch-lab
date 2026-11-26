<script setup lang="ts">
/**
 * Implicit pitch-memory check (Van Hedger et al. 2019): hear a short sine tone,
 * a noise burst, then tune a comparison tone to match it from memory.
 * ↑/↓ (or ←/→, or dragging the dial) move by 10 cents (each step plays the tone), Space replays, Enter confirms.
 */
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { audio, type PlayedSound } from '@/audio/engine'
import { db } from '@/data/db'
import { mulberry32, randomSeed } from '@/lib/random'
import { saveTestResult } from '@/ap/persistence'
import {
  centsToHz,
  generatePitchMemoryTrials,
  pitchMemoryBand,
  PM_MASK_MS,
  PM_STEP_CENTS,
  PM_TARGET_MS,
  summarizePitchMemory,
  type PitchMemoryResult,
} from '@/ap/pitchMemory'
import { useApStore } from '@/stores/ap'
import { CountUp, ProgressTrack } from '@/components/game'
import JIcon from '@/components/ap/journey/JIcon.vue'
import { dur } from '@/lib/motion'

const route = useRoute()
const router = useRouter()
const ap = useApStore()

const E2E = import.meta.env.MODE === 'e2e'
const scatterDelay = (i: number) => `${dur(60 * i + 200)}ms`
const trials = generatePitchMemoryTrials(mulberry32(randomSeed()))
const stage = ref<'intro' | 'target' | 'adjust' | 'done'>('intro')
const index = ref(0)
const offset = ref(0) // current comparison offset from the target, cents
const errors = ref<number[]>([])
const result = shallowRef<PitchMemoryResult | null>(null)
let current: PlayedSound | null = null
let busy = false

const trial = computed(() => trials[index.value]!)
const next = computed(() => (route.query.next === 'pretest' ? 'pretest' : null))

function stopCurrent() {
  current?.stop()
  current = null
}

async function playComparison() {
  stopCurrent()
  current = await audio.playSine(centsToHz(trial.value.targetHz, offset.value), 0.6)
}

async function presentTarget() {
  busy = true
  stage.value = 'target'
  offset.value = trial.value.startCents
  stopCurrent()
  const t = await audio.playSine(trial.value.targetHz, PM_TARGET_MS / 1000)
  await t.ended
  const n = await audio.playNoise(PM_MASK_MS / 1000)
  await n.ended
  stage.value = 'adjust'
  busy = false
  await playComparison()
}

async function start() {
  await audio.unlock()
  index.value = 0
  errors.value = []
  await presentTarget()
}

/** The dial shows only how far you moved from where this round started — never the target. */
const DIAL_STEPS = 20
const delta = computed(() => offset.value - trial.value.startCents)
const knobPos = computed(() => 50 + (delta.value / (DIAL_STEPS * PM_STEP_CENTS)) * 50)
const readout = computed(() => {
  const d = delta.value
  return `${d > 0 ? '+' : d < 0 ? '−' : '±'}${Math.abs(d)}`
})
const ticks = Array.from({ length: DIAL_STEPS * 2 + 1 }, (_, i) => i - DIAL_STEPS)

async function setDelta(d: number) {
  if (stage.value !== 'adjust') return
  const clamped = Math.max(-DIAL_STEPS, Math.min(DIAL_STEPS, d))
  const next = trial.value.startCents + clamped * PM_STEP_CENTS
  if (next === offset.value) return
  offset.value = next
  await playComparison()
}

async function move(steps: number) {
  await setDelta(delta.value / PM_STEP_CENTS + steps)
}

const dial = ref<HTMLElement | null>(null)
const dragging = ref(false)
function stepAt(e: PointerEvent): number {
  const r = dial.value!.getBoundingClientRect()
  const f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))
  return Math.round((f * 2 - 1) * DIAL_STEPS)
}
function onDialDown(e: PointerEvent) {
  if (stage.value !== 'adjust') return
  dragging.value = true
  dial.value!.setPointerCapture(e.pointerId)
  void setDelta(stepAt(e))
}
function onDialMove(e: PointerEvent) {
  if (dragging.value) void setDelta(stepAt(e))
}
function onDialUp() {
  dragging.value = false
}

async function confirm() {
  if (stage.value !== 'adjust' || busy) return
  stopCurrent()
  errors.value = [...errors.value, offset.value]
  if (index.value + 1 < trials.length) {
    index.value++
    await presentTarget()
    return
  }
  const r = summarizePitchMemory(errors.value)
  await saveTestResult(db, 'pitch_memory', { ...r })
  await ap.refreshTests()
  result.value = r
  stage.value = 'done'
}

function onKey(e: KeyboardEvent) {
  if (stage.value !== 'adjust') return
  if (e.code === 'ArrowUp' || e.code === 'ArrowRight') move(1)
  else if (e.code === 'ArrowDown' || e.code === 'ArrowLeft') move(-1)
  else if (e.code === 'Space') playComparison()
  else if (e.code === 'Enter') confirm()
  else return
  e.preventDefault()
}

onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  stopCurrent()
})

const bandText = computed(() => {
  if (!result.value) return ''
  switch (pitchMemoryBand(result.value.meanAbsCents)) {
    case 'very-precise':
      return 'Very precise — in the range of people with absolute pitch in the original study (~25 cents).'
    case 'good':
      return 'Good pitch memory.'
    default:
      return 'Typical. Pitch memory improves with training — this does not limit what you can learn.'
  }
})

/** Scatter of the matches on a ± cents line. */
const scatter = computed(() => {
  const errs = errors.value
  const max = Math.max(60, Math.ceil(Math.max(0, ...errs.map(Math.abs)) / 20) * 20)
  const W = 320
  const x = (c: number) => W / 2 + (c / max) * (W / 2 - 14)
  return {
    max,
    meanX: result.value ? x(result.value.meanSignedCents) : W / 2,
    dots: errs.map((c, i) => ({ key: `m-${i}`, cx: x(c), cy: 30 + (i % 4) * 13, c })),
    ticks: [-max, -max / 2, 0, max / 2, max].map((c) => ({ c, x: x(c) })),
  }
})

async function continueOn() {
  if (next.value) await router.push({ name: 'test', params: { kind: next.value } })
  else await router.push('/progress')
}
</script>

<template>
  <h1>Pitch memory check</h1>

  <section v-if="stage === 'intro'" class="card intro">
    <ol class="rules">
      <li>
        <JIcon name="ear" :size="26" />
        <strong>Hear a tone</strong>
        <span class="muted">Very short</span>
      </li>
      <li>
        <JIcon name="refresh" :size="26" />
        <strong>A burst of noise</strong>
        <span class="muted">Clears your head</span>
      </li>
      <li>
        <JIcon name="target" :size="26" />
        <strong>Tune it back</strong>
        <span class="muted">{{ trials.length }} rounds · ~3 min</span>
      </li>
    </ol>
    <details>
      <summary>Controls and notes</summary>
      <p class="muted">
        Drag the dial, or use <kbd>↑</kbd>/<kbd>↓</kbd> (10 cents a step). <kbd>Space</kbd> replays,
        <kbd>Enter</kbd> confirms. This is optional and only helps set expectations — it never
        limits your training.
      </p>
    </details>
    <div class="row">
      <button class="btn btn-primary" @click="start">Start</button>
      <button v-if="next" class="btn btn-ghost" @click="continueOn">Skip</button>
    </div>
  </section>

  <section
    v-else-if="stage === 'target' || stage === 'adjust'"
    class="card adjust"
    :data-stage="stage"
    :data-e2e-offset="E2E ? offset : undefined"
  >
    <p class="muted round">Round {{ index + 1 }} / {{ trials.length }}</p>
    <ProgressTrack :total="trials.length" :index="index" />

    <div v-if="stage === 'target'" class="listen" role="status">
      <span class="rings" aria-hidden="true"><i /><i /><i /></span>
      <p class="big">Listen…</p>
    </div>

    <div v-else class="tuner">
      <p class="lede">Match the tone you heard.</p>
      <div class="readout">
        <span class="mono">{{ readout }}</span><small>¢ moved</small>
      </div>
      <div
        ref="dial"
        class="dial"
        :class="{ dragging }"
        role="slider"
        tabindex="0"
        aria-label="Pitch adjustment"
        aria-orientation="horizontal"
        :aria-valuemin="-DIAL_STEPS"
        :aria-valuemax="DIAL_STEPS"
        :aria-valuenow="delta / PM_STEP_CENTS"
        :aria-valuetext="`${readout} cents from where you started`"
        @pointerdown.prevent="onDialDown"
        @pointermove="onDialMove"
        @pointerup="onDialUp"
        @pointercancel="onDialUp"
      >
        <span
          v-for="t in ticks"
          :key="`tick-${t}`"
          class="tick"
          :class="{ major: t % 5 === 0 }"
          :style="{ left: 50 + (t / DIAL_STEPS) * 50 + '%' }"
        />
        <span class="knob" :style="{ left: knobPos + '%' }" />
      </div>
      <div class="dial-ends" aria-hidden="true"><span>lower</span><span>higher</span></div>
      <div class="controls">
        <button class="btn round-btn" aria-label="Lower" title="Lower (↓)" @click="move(-1)">
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <path d="M3 8h10" />
          </svg>
        </button>
        <button
          class="btn round-btn"
          aria-label="Replay"
          title="Replay (Space)"
          @click="playComparison"
        >
          <JIcon name="refresh" :size="16" />
        </button>
        <button class="btn round-btn" aria-label="Higher" title="Higher (↑)" @click="move(1)">
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <path d="M3 8h10M8 3v10" />
          </svg>
        </button>
      </div>
      <button class="btn btn-primary confirm" @click="confirm">That's it</button>
    </div>
  </section>

  <section v-else-if="result" class="card result">
    <h2>
      Average error:
      <span class="bignum"><CountUp :value="Math.round(result.meanAbsCents)" /></span>
      cents
    </h2>
    <p class="lede">{{ bandText }}</p>

    <figure class="scatter">
      <svg viewBox="0 0 320 100" role="img" aria-label="Your 12 matches on a cents line">
        <line x1="14" y1="76" x2="306" y2="76" class="axis" />
        <line x1="160" y1="14" x2="160" y2="80" class="zero" />
        <g v-for="t in scatter.ticks" :key="`st-${t.c}`">
          <line :x1="t.x" y1="76" :x2="t.x" y2="80" class="axis" />
          <text :x="t.x" y="93" text-anchor="middle">{{ t.c > 0 ? '+' : '' }}{{ t.c }}</text>
        </g>
        <text x="160" y="10" text-anchor="middle" class="tgt">target</text>
        <circle
          v-for="(d, i) in scatter.dots"
          :key="d.key"
          :cx="d.cx"
          :cy="d.cy"
          r="4.5"
          class="dot"
          :style="{ animationDelay: scatterDelay(i) }"
        />
        <path
          :d="`M${scatter.meanX - 5} 72 L${scatter.meanX + 5} 72 L${scatter.meanX} 65 Z`"
          class="mean"
        />
      </svg>
      <figcaption class="fig-caption">
        Your matches, in cents from the target. Triangle: your average.
      </figcaption>
    </figure>

    <p class="muted">
      100 cents is one semitone. Your matches were on average
      {{ result.meanSignedCents >= 0 ? 'higher' : 'lower' }} than the target by
      {{ Math.abs(Math.round(result.meanSignedCents)) }} cents.
    </p>
    <button v-if="next" class="btn btn-primary" @click="continueOn">
      Continue to the baseline test
    </button>
    <RouterLink v-else class="btn btn-primary" to="/progress">Back to progress</RouterLink>
  </section>
</template>

<style scoped>
.lede {
  margin: 0.25rem 0;
  color: var(--muted);
}
.rules {
  list-style: none;
  padding: 0;
  margin: 0 0 1rem;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 0.75rem;
}
.rules li {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: 1rem 1.1rem;
  border: 1px solid var(--line);
  border-radius: var(--radius);
}
.rules :deep(svg) {
  color: var(--accent-ink);
  margin-bottom: 0.4rem;
}
.rules strong {
  font: 400 1.35rem/1.1 var(--serif);
}
.rules .muted {
  font-size: 0.85rem;
}
.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
  margin: 1rem 0 0;
}
.adjust {
  text-align: center;
  min-height: 25rem;
}
.round {
  margin: 0 0 0.5rem;
  font-size: 0.85rem;
}
.big {
  font-family: var(--serif);
  font-size: 3rem;
  font-weight: 400;
  margin: 0;
}
.listen {
  position: relative;
  display: grid;
  place-items: center;
  height: 17rem;
}
.listen .big {
  position: relative;
}
.rings {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
}
.rings i {
  position: absolute;
  width: 9rem;
  height: 9rem;
  border-radius: 50%;
  border: 1px solid var(--accent);
  opacity: 0;
  animation: ring 2.4s var(--ease-out) infinite;
}
.rings i:nth-child(2) {
  animation-delay: 0.8s;
}
.rings i:nth-child(3) {
  animation-delay: 1.6s;
}
@keyframes ring {
  from {
    opacity: 0.8;
    transform: scale(0.5);
  }
  to {
    opacity: 0;
    transform: scale(1.5);
  }
}
.tuner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  height: 17rem;
  padding-top: 0.5rem;
}
.readout {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
  height: 3rem;
}
.readout .mono {
  font-family: var(--mono);
  font-size: 2.2rem;
  letter-spacing: -0.02em;
}
.readout small {
  color: var(--muted);
}
.dial {
  position: relative;
  width: min(100%, 30rem);
  height: 3.2rem;
  margin-top: 0.25rem;
  touch-action: none;
  cursor: grab;
  user-select: none;
}
.dial.dragging {
  cursor: grabbing;
}
.dial:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 4px;
}
.tick {
  position: absolute;
  bottom: 0.9rem;
  width: 1px;
  height: 0.55rem;
  background: var(--border);
}
.tick.major {
  height: 1rem;
  background: var(--text);
  opacity: 0.6;
}
.dial::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0.9rem;
  height: 1px;
  background: var(--text);
}
.knob {
  position: absolute;
  bottom: 0.2rem;
  width: 18px;
  height: 2.1rem;
  translate: -50% 0;
  border-radius: 3px;
  background: var(--accent);
  box-shadow: 0 0 0 4px var(--accent-soft);
  transition: left 0.12s var(--ease-out);
}
.dial.dragging .knob {
  transition: none;
}
.dial-ends {
  display: flex;
  justify-content: space-between;
  width: min(100%, 30rem);
  font-size: 0.75rem;
  color: var(--muted);
}
.controls {
  display: flex;
  gap: 0.6rem;
  margin-top: 0.25rem;
}
.round-btn {
  width: 2.4rem;
  height: 2.4rem;
  padding: 0;
  border-radius: 50%;
  display: grid;
  place-items: center;
}
.round-btn svg {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.4;
  stroke-linecap: round;
}
.confirm {
  margin-top: auto;
}
.result h2 {
  font-family: var(--serif);
  font-weight: 400;
  font-size: 1.8rem;
  margin: 0;
}
.bignum {
  font-size: 4.2rem;
  line-height: 1;
  letter-spacing: -0.02em;
  color: var(--accent-ink);
  vertical-align: -0.1em;
}
.scatter {
  margin: 1rem 0;
}
.scatter svg {
  width: 100%;
  max-width: 30rem;
  height: auto;
  overflow: visible;
}
.axis {
  stroke: var(--text);
  stroke-width: 0.6;
}
.zero {
  stroke: var(--accent);
  stroke-width: 0.8;
  stroke-dasharray: 2 2;
}
.scatter text {
  font: 7px var(--mono);
  fill: var(--muted);
}
.scatter .tgt {
  font: italic 8px var(--serif);
  fill: var(--accent-ink);
}
.dot {
  fill: var(--text);
  fill-opacity: 0.75;
  animation: pop 0.4s var(--ease-spring) both;
  transform-box: fill-box;
  transform-origin: center;
}
.mean {
  fill: var(--accent);
}
@keyframes pop {
  from {
    opacity: 0;
    transform: scale(0);
  }
}
</style>
