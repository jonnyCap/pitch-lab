<script setup lang="ts">
/**
 * Implicit pitch-memory check (Van Hedger et al. 2019): hear a short sine tone,
 * a noise burst, then tune a comparison tone to match it from memory.
 * ↑/↓ move by 10 cents (each step plays the tone), Space replays, Enter confirms.
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

const route = useRoute()
const router = useRouter()
const ap = useApStore()

const E2E = import.meta.env.MODE === 'e2e'
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

async function move(steps: number) {
  if (stage.value !== 'adjust') return
  offset.value += steps * PM_STEP_CENTS
  await playComparison()
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
  if (e.code === 'ArrowUp') move(1)
  else if (e.code === 'ArrowDown') move(-1)
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

async function continueOn() {
  if (next.value) await router.push({ name: 'test', params: { kind: next.value } })
  else await router.push('/progress')
}
</script>

<template>
  <h1>Pitch memory check</h1>

  <section v-if="stage === 'intro'" class="card">
    <p>
      You'll hear a short tone, then a burst of noise. Afterwards, tune a second tone until it
      matches the first one <strong>from memory</strong>. {{ trials.length }} rounds, about 3
      minutes.
    </p>
    <ul>
      <li><kbd>↑</kbd>/<kbd>↓</kbd> or the buttons: higher / lower (each step is 10 cents)</li>
      <li><kbd>Space</kbd>: replay the tone · <kbd>Enter</kbd>: confirm</li>
    </ul>
    <p class="muted">
      This is optional and only helps set expectations — it never limits your training.
    </p>
    <div class="row">
      <button class="btn btn-primary" @click="start">Start</button>
      <button v-if="next" class="btn" @click="continueOn">Skip</button>
    </div>
  </section>

  <section
    v-else-if="stage === 'target' || stage === 'adjust'"
    class="card adjust"
    :data-stage="stage"
    :data-e2e-offset="E2E ? offset : undefined"
  >
    <p class="muted">Round {{ index + 1 }} / {{ trials.length }}</p>
    <p v-if="stage === 'target'" class="big">Listen…</p>
    <template v-else>
      <p>Match the tone you heard:</p>
      <div class="controls">
        <button class="btn" aria-label="Lower" @click="move(-1)">▼ Lower</button>
        <button class="btn" aria-label="Replay" @click="playComparison">↻ Replay</button>
        <button class="btn" aria-label="Higher" @click="move(1)">▲ Higher</button>
      </div>
      <button class="btn btn-primary" @click="confirm">That's it</button>
    </template>
  </section>

  <section v-else-if="result" class="card">
    <h2>Average error: {{ Math.round(result.meanAbsCents) }} cents</h2>
    <p>{{ bandText }}</p>
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
ul {
  padding-left: 1.2rem;
}
.row,
.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin: 0.75rem 0;
}
.adjust {
  text-align: center;
}
.adjust .controls {
  justify-content: center;
}
.big {
  font-size: 2rem;
  font-weight: 800;
}
</style>
