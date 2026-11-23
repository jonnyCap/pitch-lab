<script setup lang="ts">
/**
 * Plays one level (training step or test) end to end: intro with optional
 * sample listening → LevelRunner → emits the result. Trials are persisted as
 * they happen. Leaving the tab aborts the level (timing would be invalid).
 */
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { audio } from '@/audio/engine'
import { getTimbre } from '@/audio/instruments'
import { db } from '@/data/db'
import { mulberry32, randomSeed } from '@/lib/random'
import { midiOf, PITCH_CLASS_NAMES_SHARP, type PitchClass } from '@/music/pitch'
import type { LevelSpec } from '@/ap/protocol'
import { endSession, saveTrial, startSession } from '@/ap/persistence'
import { LevelRunner, type RunnerState, type RunResult } from '@/ap/runner'
import { generateSequence } from '@/ap/sequencer'
import PitchWheel from './PitchWheel.vue'

/** E2E mode (vite --mode e2e): short waits + exposes the target for scripted answers. */
const E2E = import.meta.env.MODE === 'e2e'
const E2E_TIMING = { shepardSec: 0.3, itiMinMs: 40, itiMaxMs: 60, feedbackMs: 60 }

const props = defineProps<{ spec: LevelSpec }>()
const emit = defineEmits<{
  finished: [result: RunResult]
  aborted: [reason: string]
}>()

const stage = ref<'intro' | 'loading' | 'running'>('intro')
const state = shallowRef<RunnerState | null>(null)
const error = ref<string | null>(null)
const now = ref(performance.now())
let runner: LevelRunner | null = null
const e2eSequence = shallowRef<readonly { pitchClass: PitchClass }[]>([])
const e2eTarget = computed(() =>
  E2E && state.value?.phase === 'listening'
    ? String(e2eSequence.value[state.value.index]?.pitchClass ?? '')
    : undefined,
)
let ticker: ReturnType<typeof setInterval> | undefined

const timbreLabels = computed(() => props.spec.timbres.map((t) => getTimbre(t).label))
const octaveLabel = computed(() =>
  props.spec.octaves.length === 1
    ? `octave ${props.spec.octaves[0]}`
    : `octaves ${props.spec.octaves[0]}–${props.spec.octaves.at(-1)}`,
)
const isTest = computed(() => props.spec.kind === 'test')

const countdown = computed(() => {
  const end = state.value?.interferenceEndsAt
  return end ? Math.max(0, Math.ceil((end - now.value) / 1000)) : null
})

const highlight = computed(() => {
  const fb = state.value?.phase === 'feedback' ? state.value.feedback : null
  if (!fb) return { correct: null, wrong: null }
  return {
    correct: fb.target,
    wrong: !fb.correct && typeof fb.response === 'number' ? fb.response : null,
  }
})

// --- Sample listening (training only, before interference) ----------------
const sampleTimbre = ref(0)
async function playSample(pc: PitchClass) {
  const timbre = props.spec.timbres[sampleTimbre.value % props.spec.timbres.length]!
  sampleTimbre.value++
  await audio.playTone(timbre, midiOf(pc, 4))
}

// --- Run --------------------------------------------------------------------
async function start() {
  error.value = null
  stage.value = 'loading'
  try {
    await audio.unlock()
    const rng = mulberry32(randomSeed())
    const sequence = generateSequence(props.spec, (t) => getTimbre(t).range, rng)
    const byTimbre = new Map<string, number[]>()
    for (const s of sequence) byTimbre.set(s.timbre, [...(byTimbre.get(s.timbre) ?? []), s.midi])
    await Promise.all([...byTimbre].map(([t, midis]) => audio.preload(t, midis)))

    if (E2E) e2eSequence.value = sequence
    const session = await startSession(db, { levelId: props.spec.id, kind: props.spec.kind })
    const startedAt = performance.now()
    runner = new LevelRunner(props.spec, sequence, {
      audio,
      rng,
      onState: (s) => (state.value = s),
      onTrial: (t) => saveTrial(db, t, session.id, props.spec.id),
      ...(E2E ? E2E_TIMING : {}),
    })
    stage.value = 'running'
    ticker = setInterval(() => (now.value = performance.now()), 250)
    const result = await runner.run()
    clearInterval(ticker)
    await endSession(db, session, Math.round(performance.now() - startedAt))
    if (result) emit('finished', result)
  } catch (e) {
    clearInterval(ticker)
    error.value = e instanceof Error ? e.message : String(e)
    stage.value = 'intro'
  }
}

function answer(pc: PitchClass, timeStamp: number) {
  runner?.respond(pc, timeStamp)
}

function quit(reason = 'You left the level.') {
  if (!runner) return
  runner.abort()
  runner = null
  clearInterval(ticker)
  emit('aborted', reason)
}

function onVisibility() {
  if (document.hidden && stage.value === 'running') {
    quit('The level was stopped because the app went into the background.')
  }
}

onMounted(() => document.addEventListener('visibilitychange', onVisibility))
onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisibility)
  runner?.abort()
  clearInterval(ticker)
})
</script>

<template>
  <section v-if="stage !== 'running'" class="card intro">
    <h2>{{ spec.title }}</h2>
    <ul class="facts">
      <li>
        <strong>{{ spec.pitchSet.length }}</strong> pitches:
        <span v-for="pc in spec.pitchSet" :key="pc" class="chip">{{
          PITCH_CLASS_NAMES_SHARP[pc]
        }}</span>
      </li>
      <li>{{ timbreLabels.join(', ') }} · {{ octaveLabel }}</li>
      <li>
        {{ spec.trials }} notes · {{ spec.feedback ? 'with feedback' : 'no feedback' }} · answer
        within {{ spec.deadlineMs / 1000 }} s
        <template v-if="!isTest"> · pass at {{ Math.round(spec.passAccuracy * 100) }}%</template>
      </li>
    </ul>

    <div v-if="!isTest" class="samples">
      <p class="muted">Listen to the pitches as often as you like before you start:</p>
      <div class="row">
        <button v-for="pc in spec.pitchSet" :key="pc" class="btn" @click="playSample(pc)">
          ▶ {{ PITCH_CLASS_NAMES_SHARP[pc] }}
        </button>
      </div>
    </div>

    <p v-if="spec.interference" class="muted note">
      A 15-second sliding tone plays first to clear your memory of the reference notes. No humming
      or comparing — name each note on its own.
    </p>

    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <button class="btn btn-primary start" :disabled="stage === 'loading'" @click="start">
      {{ stage === 'loading' ? 'Loading sounds…' : 'Start' }}
    </button>
  </section>

  <section
    v-else
    class="run"
    :data-phase="state?.phase"
    :data-index="state?.index"
    :data-e2e-target="e2eTarget"
  >
    <div class="topline">
      <span class="muted">
        {{
          state?.phase === 'interference'
            ? 'Clearing…'
            : `Note ${(state?.index ?? 0) + 1} / ${state?.total}`
        }}
      </span>
      <button class="btn small" @click="quit()">Stop</button>
    </div>
    <progress :value="state?.index ?? 0" :max="state?.total ?? 1" />

    <PitchWheel
      :options="spec.responseOptions"
      :disabled="state?.phase !== 'listening'"
      :correct="highlight.correct"
      :wrong="highlight.wrong"
      @answer="answer"
    >
      <div class="status" aria-live="polite">
        <template v-if="state?.phase === 'interference'">
          <span class="big">{{ countdown }}</span>
          <span class="muted">clearing</span>
        </template>
        <template v-else-if="state?.phase === 'listening'">
          <span class="big">♪</span>
          <span class="muted">which note?</span>
        </template>
        <template v-else-if="state?.phase === 'feedback' && state.feedback">
          <span class="big" :class="state.feedback.correct ? 'ok' : 'bad'">
            {{ state.feedback.correct ? '✓' : '✗' }}
          </span>
          <span>
            {{ state.feedback.response === 'timeout' ? 'Too slow — ' : '' }}it was
            <strong>{{ PITCH_CLASS_NAMES_SHARP[state.feedback.target] }}</strong>
          </span>
        </template>
        <template v-else>
          <span class="muted">…</span>
        </template>
      </div>
    </PitchWheel>
  </section>
</template>

<style scoped>
.intro h2 {
  margin-top: 0;
}
.facts {
  list-style: none;
  padding: 0;
  display: grid;
  gap: 0.35rem;
}
.chip {
  display: inline-block;
  margin-left: 0.3rem;
  padding: 0 0.5rem;
  border-radius: 999px;
  background: var(--bg);
  border: 1px solid var(--border);
  font-weight: 600;
}
.row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.note {
  font-size: 0.9rem;
}
.start {
  margin-top: 1rem;
  min-width: 10rem;
}
.error {
  color: var(--bad);
}
.run {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.topline {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.btn.small {
  padding: 0.3rem 0.75rem;
}
progress {
  width: 100%;
  height: 6px;
  accent-color: var(--accent);
}
.status {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
}
.big {
  font-size: 2.6rem;
  font-weight: 800;
  line-height: 1;
}
.ok {
  color: var(--ok);
}
.bad {
  color: var(--bad);
}
</style>
