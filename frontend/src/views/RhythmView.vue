<script setup lang="ts">
/**
 * Rhythm reading by tapping along. One-time latency calibration (tap with 8
 * clicks), then: read a 2-bar 4/4 pattern, optionally listen, get a one-bar
 * count-in and tap the rhythm while a quiet metronome keeps the beat.
 * Taps are latency-corrected and scored per note.
 */
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { RouterLink } from 'vue-router'
import { audio } from '@/audio/engine'
import { db } from '@/data/db'
import { mulberry32, randomSeed } from '@/lib/random'
import {
  applyRhythmResult,
  beatMs,
  calibrateLatency,
  generatePattern,
  initialRhythmProgress,
  noteOnsets,
  PASS_SCORE,
  PASSES_TO_ADVANCE,
  scoreTaps,
  type RhythmEvent,
  type RhythmProgress,
  type TapResult,
} from '@/learn/rhythm'
import { loadRhythmProgress, logRhythmAttempt, saveRhythmProgress } from '@/learn/store'
import { CoachTour, CountUp, HelpButton, ResultStamp } from '@/components/game'
import { haptic } from '@/lib/fx'
import type { TourStep } from '@/lib/tour'
import RhythmNotation from '@/components/learn/RhythmNotation.vue'
import BeatDots from '@/components/learn/BeatDots.vue'
import TimingLane from '@/components/learn/TimingLane.vue'

const E2E = import.meta.env.MODE === 'e2e'
const CAL_BPM = 90
const CAL_CLICKS = 12 // 4 count-in + 8 to tap along with
const TEMPOS = [60, 70, 80, 90, 100, 110, 120]
const LEVEL_TEXT: Record<number, string> = {
  1: 'quarters, halves and quarter rests',
  2: '+ eighth notes',
  3: '+ dotted rhythms and eighth rests',
  4: '+ sixteenths and syncopation',
}

const rng = mulberry32(randomSeed())
const progress = ref<RhythmProgress>(initialRhythmProgress())
const loaded = ref(false)
const stage = ref<'ready' | 'calibrating' | 'listening' | 'countin' | 'tapping' | 'result'>('ready')
const pattern = shallowRef<RhythmEvent[][]>([])
const result = shallowRef<TapResult | null>(null)
const levelUp = ref(false)
const calMessage = ref<string | null>(null)
const beatIndex = ref(-1)
const tapCount = ref(0)
const ripples = ref<{ id: number; x: number; y: number }[]>([])
const tour = ref<InstanceType<typeof CoachTour> | null>(null)
let rippleId = 0
const TOUR: TourStep[] = [
  {
    target: '[data-tour="notation"]',
    title: 'Read the rhythm',
    body: 'Two bars of 4/4. Every note head is a tap, rests are silence.',
    placement: 'bottom',
  },
  {
    target: '[data-tour="listen"]',
    title: 'Listen first',
    body: 'Hear the pattern against the metronome before you try it.',
    placement: 'top',
  },
  {
    target: '[data-tour="tap"]',
    title: 'Tap it',
    body: 'After a one-bar count-in, tap each note on the pad or with Space. Three clean patterns unlock the next level.',
    placement: 'top',
  },
]

let taps: number[] = []
let expectedPerf: number[] = []
let clickPerf: number[] = []
let barStartPerf = 0
let timers: ReturnType<typeof setTimeout>[] = []

onMounted(async () => {
  progress.value = await loadRhythmProgress(db)
  pattern.value = generatePattern(progress.value.level, rng)
  loaded.value = true
})

function clearTimers() {
  timers.forEach(clearTimeout)
  timers = []
}
onBeforeUnmount(clearTimers)

const beat = computed(() => beatMs(progress.value.bpm))
const calibrated = computed(() => progress.value.latencyMs !== null)

async function setTempo(bpm: number) {
  progress.value = { ...progress.value, bpm }
  await saveRhythmProgress(db, progress.value)
}

/** Shows beat numbers during count-in / tapping. */
function scheduleBeatDisplay(firstPerf: number, beats: number, beatLen: number) {
  for (let b = 0; b < beats; b++) {
    const delay = firstPerf + b * beatLen - performance.now()
    timers.push(setTimeout(() => (beatIndex.value = b), Math.max(0, delay)))
  }
}

// --- Calibration ----------------------------------------------------------
async function calibrate() {
  clearTimers()
  calMessage.value = null
  taps = []
  tapCount.value = 0
  stage.value = 'calibrating'
  const b = 60 / CAL_BPM
  const sounds = await audio.playClicks(
    Array.from({ length: CAL_CLICKS }, (_, i) => ({
      at: i * b,
      freq: i % 4 === 0 ? 2000 : 1500,
      gain: 0.5,
    })),
  )
  clickPerf = sounds.map((s) => s.onsetPerfMs)
  scheduleBeatDisplay(clickPerf[0]!, CAL_CLICKS, b * 1000)
  const end = clickPerf.at(-1)! + 600 - performance.now()
  timers.push(
    setTimeout(
      async () => {
        const lat = calibrateLatency(clickPerf.slice(4), taps)
        beatIndex.value = -1
        if (lat === null) {
          calMessage.value = 'Not enough taps were close to the clicks — please try again.'
        } else {
          progress.value = { ...progress.value, latencyMs: Math.round(lat) }
          await saveRhythmProgress(db, progress.value)
          calMessage.value = `Calibrated: ${Math.round(lat)} ms delay will be compensated.`
        }
        stage.value = 'ready'
      },
      Math.max(0, end),
    ),
  )
}

// --- Listening / tapping ----------------------------------------------------
async function listen() {
  clearTimers()
  stage.value = 'listening'
  const b = beat.value / 1000
  const countIn = [0, 1, 2, 3].map((i) => ({ at: i * b, freq: i === 0 ? 2000 : 1500, gain: 0.25 }))
  const notes = noteOnsets(pattern.value).map((t) => ({ at: (4 + t) * b, freq: 900, gain: 0.6 }))
  const sounds = await audio.playClicks([...countIn, ...notes])
  scheduleBeatDisplay(sounds[0]!.onsetPerfMs, 12, beat.value)
  const end = sounds[0]!.onsetPerfMs + 12 * beat.value - performance.now()
  timers.push(
    setTimeout(
      () => {
        beatIndex.value = -1
        stage.value = 'ready'
      },
      Math.max(0, end),
    ),
  )
}

async function startTapping() {
  clearTimers()
  taps = []
  tapCount.value = 0
  result.value = null
  levelUp.value = false
  stage.value = 'countin'
  const b = beat.value / 1000
  // Count-in bar (loud) + a quiet metronome through the 2 pattern bars.
  const clicks = Array.from({ length: 12 }, (_, i) => ({
    at: i * b,
    freq: i % 4 === 0 ? 2000 : 1500,
    gain: i < 4 ? 0.45 : 0.12,
  }))
  const sounds = await audio.playClicks(clicks)
  barStartPerf = sounds[4]!.onsetPerfMs
  expectedPerf = noteOnsets(pattern.value).map((t) => barStartPerf + t * beat.value)
  scheduleBeatDisplay(sounds[0]!.onsetPerfMs, 12, beat.value)
  timers.push(
    setTimeout(
      () => (stage.value = 'tapping'),
      Math.max(0, barStartPerf - beat.value / 2 - performance.now()),
    ),
  )
  const end = barStartPerf + 8 * beat.value + 250 - performance.now()
  timers.push(setTimeout(finish, Math.max(0, end)))
}

async function finish() {
  beatIndex.value = -1
  const latency = progress.value.latencyMs ?? 0
  const r = scoreTaps(
    expectedPerf,
    taps.map((t) => t - latency),
  )
  result.value = r
  resultBeatMs.value = beat.value
  const applied = applyRhythmResult(progress.value, r.score)
  levelUp.value = applied.levelUp
  const level = progress.value.level
  progress.value = applied.progress
  stage.value = 'result'
  await saveRhythmProgress(db, progress.value)
  await logRhythmAttempt(db, level, r.score, r.meanAbsErrorMs, r.score >= PASS_SCORE)
}

function tap(timeStamp: number) {
  if (stage.value === 'calibrating' || stage.value === 'tapping' || stage.value === 'countin') {
    taps.push(timeStamp)
    tapCount.value++
  }
}

/** Pad press: records the tap (using the event timestamp) and spawns a ripple. */
function padDown(e: PointerEvent) {
  tap(e.timeStamp)
  haptic('tap')
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const id = ++rippleId
  ripples.value.push({ id, x: e.clientX - r.left, y: e.clientY - r.top })
  setTimeout(() => (ripples.value = ripples.value.filter((x) => x.id !== id)), 650)
}

function nextPattern() {
  pattern.value = generatePattern(progress.value.level, rng)
  result.value = null
  stage.value = 'ready'
}

function onKey(e: KeyboardEvent) {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
  if (e.code === 'Space' || e.code === 'KeyJ' || e.code === 'KeyF') {
    if (stage.value === 'calibrating' || stage.value === 'tapping' || stage.value === 'countin') {
      e.preventDefault()
      tap(e.timeStamp)
    }
  }
}
window.addEventListener('keydown', onKey)
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

// E2E hooks: inject taps relative to the click/bar timeline (no real-time key presses needed).
if (E2E) {
  const w = window as unknown as Record<string, unknown>
  w.__rhythm = {
    tapAtBar: (offsetMs: number) => {
      taps.push(barStartPerf + offsetMs + (progress.value.latencyMs ?? 0))
      tapCount.value++
    },
    tapAtClick: (i: number, offsetMs: number) => {
      taps.push(clickPerf[i]! + offsetMs)
      tapCount.value++
    },
    expectedOffsets: () => expectedPerf.map((t) => t - barStartPerf),
  }
}

const tendency = computed(() => {
  const m = result.value?.meanErrorMs
  if (m === null || m === undefined) return null
  if (Math.abs(m) < 15) return 'Your timing was centred on the beat.'
  return `On average you were ${Math.round(Math.abs(m))} ms ${m < 0 ? 'early' : 'late'}.`
})
const resultBeatMs = ref(0)
const onsetBeats = computed(() => noteOnsets(pattern.value))
const canAct = computed(() => stage.value === 'ready' || stage.value === 'result')
const beatLabel = computed(() => (beatIndex.value < 0 ? '' : String((beatIndex.value % 4) + 1)))
const pct = (x: number) => `${Math.round(x * 100)}%`
</script>

<template>
  <p class="muted crumbs">
    <RouterLink to="/learn">Learn</RouterLink> <span aria-hidden="true">/</span> Rhythm reading
  </p>
  <div class="titlebar">
    <h1>Rhythm reading</h1>
    <HelpButton v-if="loaded && calibrated && canAct" @click="tour?.start()" />
  </div>

  <p v-if="!loaded" class="muted">Loading…</p>

  <template v-else>
    <section class="card controls">
      <div>
        <strong class="level">Level {{ progress.level }}</strong>
        <span class="muted"> · {{ LEVEL_TEXT[progress.level] }}</span>
        <div class="passes muted">
          <span class="pips" aria-hidden="true">
            <i
              v-for="n in PASSES_TO_ADVANCE"
              :key="`pip-${n}`"
              :class="{ on: n <= progress.passes }"
            />
          </span>
          <span
            >{{ progress.passes }}/{{ PASSES_TO_ADVANCE }} patterns at ≥ {{ pct(PASS_SCORE) }}</span
          >
        </div>
      </div>
      <label class="tempo">
        Tempo
        <select
          :value="progress.bpm"
          :disabled="!canAct"
          @change="setTempo(Number(($event.target as HTMLSelectElement).value))"
        >
          <option v-for="t in TEMPOS" :key="t" :value="t">{{ t }} bpm</option>
        </select>
      </label>
    </section>

    <section
      v-if="!calibrated || stage === 'calibrating'"
      class="card calibrate"
      :data-stage="stage"
    >
      <p class="kicker">Calibrate once</p>
      <h2>Tap with the clicks</h2>
      <p class="muted">
        Every device has a small delay. After a 4-click count-in, tap the next 8 clicks on the beat.
      </p>
      <BeatDots :beat="stage === 'calibrating' ? beatIndex : -1" />
      <div class="cal-progress" aria-label="Calibration taps">
        <i
          v-for="n in 8"
          :key="`cal-${n}`"
          :class="{ on: stage === 'calibrating' && n <= tapCount }"
        />
      </div>
      <p v-if="calMessage" role="status">{{ calMessage }}</p>
      <button v-if="stage !== 'calibrating'" class="btn btn-primary" @click="calibrate">
        Start calibration
      </button>
    </section>

    <section v-else class="card exercise" :data-stage="stage">
      <div data-tour="notation" class="notation">
        <RhythmNotation :bars="pattern" time-signature="4/4" />
      </div>
      <BeatDots :beat="beatIndex" />
      <div class="row">
        <button class="btn" data-tour="listen" :disabled="!canAct" @click="listen">
          <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
            <path d="M5 3l8 5-8 5z" fill="none" stroke="currentColor" stroke-width="1.2" />
          </svg>
          Listen
        </button>
        <button class="btn btn-primary" data-tour="tap" :disabled="!canAct" @click="startTapping">
          Tap it
        </button>
        <button class="btn btn-ghost" :disabled="!canAct" @click="nextPattern">New pattern</button>
      </div>
      <p v-if="calMessage" class="muted small">{{ calMessage }}</p>
      <button class="link" :disabled="!canAct" @click="calibrate">Recalibrate</button>

      <div v-if="stage === 'result' && result" class="result" role="status">
        <h2 :class="result.score >= PASS_SCORE ? 'ok' : ''">
          <CountUp :value="Math.round(result.score * 100)" suffix="%" />
        </h2>
        <p>
          {{ result.hits }} of {{ result.hits + result.misses }} notes hit
          <template v-if="result.misses"> · {{ result.misses }} missed</template>
          <template v-if="result.extras"> · {{ result.extras }} extra taps</template>
          <template v-if="result.meanAbsErrorMs !== null">
            · average error {{ Math.round(result.meanAbsErrorMs) }} ms
          </template>
        </p>
        <p v-if="tendency" class="muted">{{ tendency }}</p>
        <TimingLane
          :onsets="onsetBeats"
          :errors="result.perNote"
          :beat-ms="resultBeatMs"
          :beats="8"
        />
        <div v-if="levelUp" class="levelup">
          <ResultStamp text="Level up!" tone="ok" />
          <p class="muted">New rhythms unlocked.</p>
        </div>
      </div>
    </section>

    <button
      v-if="stage === 'calibrating' || stage === 'countin' || stage === 'tapping'"
      class="pad"
      :class="{ live: stage !== 'countin' }"
      @pointerdown.prevent="padDown"
    >
      <span class="ripples" aria-hidden="true">
        <i v-for="r in ripples" :key="`r-${r.id}`" :style="{ left: r.x + 'px', top: r.y + 'px' }" />
      </span>
      <span :key="`b-${beatIndex}`" class="beat">{{ beatLabel }}</span>
      <span class="padhint">{{
        stage === 'countin' ? 'Get ready…' : 'Tap here or press Space'
      }}</span>
    </button>

    <CoachTour
      v-if="calibrated && canAct"
      ref="tour"
      id="rhythm"
      :steps="TOUR"
      :auto-start="stage === 'ready'"
    />
  </template>
</template>

<style scoped>
.crumbs {
  margin: 0;
  font-size: 0.9rem;
}
.titlebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}
.titlebar h1 {
  font-size: clamp(2rem, 4vw, 2.6rem);
}
.controls {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
}
.level {
  font-family: var(--display);
  font-weight: 400;
  font-size: 1.6rem;
}
.passes {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-size: 0.85rem;
  margin-top: 0.25rem;
}
.pips {
  display: inline-flex;
  gap: 4px;
}
.pips i,
.cal-progress i {
  display: block;
  width: 0.6rem;
  height: 0.6rem;
  border-radius: 50%;
  border: 1px solid var(--muted);
  transition:
    background-color 0.2s,
    transform 0.2s var(--ease-spring, ease-out);
}
.pips i.on,
.cal-progress i.on {
  background: var(--accent);
  border-color: var(--accent);
  transform: scale(1.15);
}
.tempo {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
}
.small {
  font-size: 0.85rem;
}
.exercise,
.calibrate {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding-block: 1.75rem;
}
.calibrate {
  align-items: center;
  text-align: center;
}
.calibrate h2,
.calibrate p {
  margin: 0;
}
.calibrate h2 {
  font-size: 1.6rem;
}
.cal-progress {
  display: flex;
  gap: 0.6rem;
}
.cal-progress i {
  width: 0.9rem;
  height: 0.9rem;
}
.notation {
  width: 100%;
}
.row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  justify-content: center;
}
.row .btn svg {
  margin-right: 0.4rem;
}
.link {
  align-self: center;
  background: none;
  border: none;
  color: var(--muted);
  font: inherit;
  font-size: 0.85rem;
  cursor: pointer;
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 4px;
}
.link:hover:not(:disabled) {
  color: var(--accent-ink);
}
.result {
  text-align: center;
  border-top: 1px solid var(--line);
  padding-top: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  animation: rise 0.4s var(--ease-out);
}
@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
}
.result p {
  margin: 0;
}
.result h2 {
  margin: 0;
  font-size: clamp(2.8rem, 9vw, 3.8rem);
  line-height: 1;
}
.levelup {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.5rem;
}
.ok {
  color: var(--ok);
}
.pad {
  position: relative;
  overflow: hidden;
  margin-top: 1rem;
  width: 100%;
  min-height: 220px;
  border-radius: var(--radius);
  border: 1px dashed var(--muted);
  background: var(--surface);
  color: var(--muted);
  font: inherit;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  touch-action: manipulation;
  user-select: none;
  transition:
    border-color 0.2s,
    background-color 0.1s;
}
.pad.live {
  border: 1px solid var(--accent);
  color: var(--text);
}
.pad:active {
  background: var(--accent-soft);
}
.ripples i {
  position: absolute;
  width: 20px;
  height: 20px;
  margin: -10px 0 0 -10px;
  border-radius: 50%;
  border: 2px solid var(--accent);
  pointer-events: none;
  animation: ripple 0.6s var(--ease-out) forwards;
}
@keyframes ripple {
  to {
    transform: scale(14);
    opacity: 0;
  }
}
.beat {
  font-family: var(--display);
  font-size: 4.2rem;
  line-height: 1;
  min-height: 5.5rem;
  animation: pop 0.25s var(--ease-out);
}
@keyframes pop {
  from {
    transform: scale(0.8);
    opacity: 0.2;
  }
}
.padhint {
  font-size: 0.85rem;
  color: var(--muted);
}
</style>
