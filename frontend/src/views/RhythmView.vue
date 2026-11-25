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
  RHYTHM_LEVELS,
  scoreTaps,
  type RhythmEvent,
  type RhythmProgress,
  type TapResult,
} from '@/learn/rhythm'
import { loadRhythmProgress, logRhythmAttempt, saveRhythmProgress } from '@/learn/store'
import RhythmNotation from '@/components/learn/RhythmNotation.vue'

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
  }
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
    tapAtBar: (offsetMs: number) =>
      taps.push(barStartPerf + offsetMs + (progress.value.latencyMs ?? 0)),
    tapAtClick: (i: number, offsetMs: number) => taps.push(clickPerf[i]! + offsetMs),
    expectedOffsets: () => expectedPerf.map((t) => t - barStartPerf),
  }
}

const tendency = computed(() => {
  const m = result.value?.meanErrorMs
  if (m === null || m === undefined) return null
  if (Math.abs(m) < 15) return 'Your timing was centred on the beat.'
  return `On average you were ${Math.round(Math.abs(m))} ms ${m < 0 ? 'early' : 'late'}.`
})
const beatLabel = computed(() => (beatIndex.value < 0 ? '' : String((beatIndex.value % 4) + 1)))
const pct = (x: number) => `${Math.round(x * 100)}%`
</script>

<template>
  <p class="muted crumbs"><RouterLink to="/learn">Learn</RouterLink> / Rhythm reading</p>
  <h1>Rhythm reading</h1>

  <p v-if="!loaded" class="muted">Loading…</p>

  <template v-else>
    <section class="card controls">
      <div>
        <strong>Level {{ progress.level }}</strong>
        <span class="muted"> · {{ LEVEL_TEXT[progress.level] }}</span>
        <div class="muted small">
          {{ progress.passes }}/{{ PASSES_TO_ADVANCE }} patterns at ≥ {{ pct(PASS_SCORE) }}
          {{ progress.level < RHYTHM_LEVELS.at(-1)! ? 'to unlock the next level' : '' }}
        </div>
      </div>
      <label>
        Tempo
        <select
          :value="progress.bpm"
          :disabled="stage !== 'ready' && stage !== 'result'"
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
      <h2>Calibrate once</h2>
      <p>
        Every device has a small delay between sound, screen and touch. Tap along with the clicks —
        after a 4-click count-in, tap the next 8 clicks exactly on the beat.
      </p>
      <p v-if="calMessage" role="status">{{ calMessage }}</p>
      <button v-if="stage !== 'calibrating'" class="btn btn-primary" @click="calibrate">
        Start calibration
      </button>
    </section>

    <section v-else class="card exercise" :data-stage="stage">
      <RhythmNotation :bars="pattern" time-signature="4/4" />
      <div class="row">
        <button class="btn" :disabled="stage !== 'ready' && stage !== 'result'" @click="listen">
          ▶ Listen
        </button>
        <button
          class="btn btn-primary"
          :disabled="stage !== 'ready' && stage !== 'result'"
          @click="startTapping"
        >
          Tap it
        </button>
        <button
          class="btn"
          :disabled="stage !== 'ready' && stage !== 'result'"
          @click="nextPattern"
        >
          New pattern
        </button>
      </div>
      <p v-if="calMessage" class="muted small">{{ calMessage }}</p>
      <button class="link" :disabled="stage !== 'ready' && stage !== 'result'" @click="calibrate">
        Recalibrate
      </button>

      <div v-if="stage === 'result' && result" class="result" role="status">
        <h2 :class="result.score >= PASS_SCORE ? 'ok' : ''">{{ pct(result.score) }}</h2>
        <p>
          {{ result.hits }} of {{ result.hits + result.misses }} notes hit
          <template v-if="result.misses"> · {{ result.misses }} missed</template>
          <template v-if="result.extras"> · {{ result.extras }} extra taps</template>
          <template v-if="result.meanAbsErrorMs !== null">
            · average error {{ Math.round(result.meanAbsErrorMs) }} ms
          </template>
        </p>
        <p v-if="tendency" class="muted">{{ tendency }}</p>
        <ol class="marks" aria-label="Per-note timing">
          <li
            v-for="(e, i) in result.perNote"
            :key="i"
            :class="
              e === null
                ? 'miss'
                : Math.abs(e) <= 40
                  ? 'good'
                  : Math.abs(e) <= 90
                    ? 'ok-ish'
                    : 'off'
            "
            :title="e === null ? 'missed' : `${e > 0 ? '+' : ''}${Math.round(e)} ms`"
          />
        </ol>
        <p v-if="levelUp" class="ok"><strong>Level up!</strong> New rhythms unlocked.</p>
      </div>
    </section>

    <button
      v-if="stage === 'calibrating' || stage === 'countin' || stage === 'tapping'"
      class="pad"
      :class="{ live: stage !== 'countin' }"
      @pointerdown.prevent="tap($event.timeStamp)"
    >
      <span class="beat">{{ beatLabel }}</span>
      <span>{{ stage === 'countin' ? 'Get ready…' : 'Tap here or press Space' }}</span>
    </button>
  </template>
</template>

<style scoped>
.crumbs {
  margin: 0;
  font-size: 0.9rem;
}
.controls {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
}
.small {
  font-size: 0.85rem;
}
.exercise,
.calibrate {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.calibrate h2 {
  margin: 0;
}
.row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  justify-content: center;
}
.link {
  align-self: center;
  background: none;
  border: none;
  color: var(--accent);
  font: inherit;
  cursor: pointer;
}
.result {
  text-align: center;
}
.result h2 {
  margin: 0;
  font-size: 2.2rem;
}
.ok {
  color: var(--ok);
}
.marks {
  display: flex;
  justify-content: center;
  gap: 6px;
  list-style: none;
  padding: 0;
}
.marks li {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}
.marks .good {
  background: var(--ok);
}
.marks .ok-ish {
  background: #d97706;
}
.marks .off,
.marks .miss {
  background: var(--bad);
}
.marks .miss {
  opacity: 0.4;
}
.pad {
  margin-top: 1rem;
  width: 100%;
  min-height: 160px;
  border-radius: var(--radius);
  border: 2px dashed var(--border);
  background: var(--surface);
  color: var(--muted);
  font: inherit;
  font-weight: 700;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  touch-action: manipulation;
  user-select: none;
}
.pad.live {
  border-color: var(--series);
  color: var(--text);
}
.pad:active {
  background: var(--bg);
}
.beat {
  font-size: 2.5rem;
  min-height: 3rem;
}
</style>
