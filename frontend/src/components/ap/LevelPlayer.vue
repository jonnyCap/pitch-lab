<script setup lang="ts">
/**
 * Plays one level (training step, drill or test) end to end: intro with optional
 * sample listening → LevelRunner → emits the result. Trials are persisted as
 * they happen. Leaving the tab aborts the level (timing would be invalid).
 * Feedback steps adapt sampling to recent confusions; drills focus one pitch.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { audio } from '@/audio/engine'
import { getTimbre } from '@/audio/instruments'
import { db } from '@/data/db'
import { mulberry32, randomSeed } from '@/lib/random'
import { midiOf, PITCH_CLASS_NAMES_SHARP, type PitchClass } from '@/music/pitch'
import type { LevelSpec } from '@/ap/protocol'
import { adaptiveWeights, confusionPartners, drillWeights } from '@/ap/adaptive'
import { endSession, recentTrainingTrials, saveTrial, startSession } from '@/ap/persistence'
import { LevelRunner, type RunnerState, type RunResult } from '@/ap/runner'
import { generateSequence, type SequenceSpec } from '@/ap/sequencer'
import { Countdown, ComboMeter, ProgressTrack } from '@/components/game'
import { haptic, popText, pulse, shake } from '@/lib/fx'
import PitchWheel, { type WheelAnswer } from './PitchWheel.vue'
import SoundRipple from './SoundRipple.vue'

/** E2E mode (vite --mode e2e): short waits + exposes the target for scripted answers. */
const E2E = import.meta.env.MODE === 'e2e'
const E2E_TIMING = { shepardSec: 0.3, itiMinMs: 40, itiMaxMs: 60, feedbackMs: 60 }

const props = defineProps<{
  spec: LevelSpec
  /** Start is not allowed before this time (12 h mastery gap). */
  blockedUntil?: number | null
}>()
const emit = defineEmits<{
  finished: [result: RunResult]
  aborted: [reason: string]
  /** True while the level is running (parents hide surrounding chrome). */
  running: [running: boolean]
}>()

const stage = ref<'intro' | 'loading' | 'running'>('intro')
/** Countdown overlay is up (the runner has not started yet). */
const counting = ref(false)
let cancelled = false
let countdownDone: (() => void) | null = null
const wheel = ref<InstanceType<typeof PitchWheel> | null>(null)
const combo = ref(0)
const bestCombo = ref(0)
const results = ref<('ok' | 'bad' | null)[]>([])
watch(stage, (s) => emit('running', s === 'running'))
const state = shallowRef<RunnerState | null>(null)
const error = ref<string | null>(null)
const now = ref(performance.now())
let runner: LevelRunner | null = null
const e2eSequence = shallowRef<readonly { pitchClass: PitchClass; isDistractor: boolean }[]>([])
const e2eTarget = computed(() => {
  if (!E2E || state.value?.phase !== 'listening') return undefined
  const s = e2eSequence.value[state.value.index]
  return s ? (s.isDistractor ? 'none' : String(s.pitchClass)) : undefined
})
let ticker: ReturnType<typeof setInterval> | undefined

const timbreLabels = computed(() => props.spec.timbres.map((t) => getTimbre(t).label))
const octaveLabel = computed(() =>
  props.spec.octaves.length === 1
    ? `octave ${props.spec.octaves[0]}`
    : `octaves ${props.spec.octaves[0]}–${props.spec.octaves.at(-1)}`,
)
const isTest = computed(() => props.spec.kind === 'test')
const hasNotes = computed(
  () =>
    props.spec.allowNone ||
    props.spec.specialRate > 0 ||
    !!props.spec.focus ||
    !!props.spec.final ||
    !!props.spec.interference,
)
const total = computed(() => state.value?.total ?? props.spec.trials)
const counter = computed(() => {
  const w = String(total.value).length
  return `${String((state.value?.index ?? 0) + 1).padStart(w, '0')} / ${total.value}`
})
const passPct = computed(() => Math.round(props.spec.passAccuracy * 100))
const specialNames = computed(() =>
  props.spec.focus
    ? props.spec.focus.partners.map((p) => PITCH_CLASS_NAMES_SHARP[p]).join(', ')
    : '',
)

// The trainer dashboard's tour (TrainerView, id 'trainer') walks through this card via the
// data-tour targets below, so the player has no tour of its own.

const countdown = computed(() => {
  const end = state.value?.interferenceEndsAt
  return end ? Math.max(0, Math.ceil((end - now.value) / 1000)) : null
})

const highlight = computed<{ correct: WheelAnswer | null; wrong: WheelAnswer | null }>(() => {
  const fb = state.value?.phase === 'feedback' ? state.value.feedback : null
  if (!fb) return { correct: null, wrong: null }
  const right: WheelAnswer = fb.isDistractor ? 'none' : fb.target
  return {
    correct: right,
    wrong: !fb.correct && fb.response !== 'timeout' ? fb.response : null,
  }
})

const blockedText = computed(() =>
  props.blockedUntil
    ? new Date(props.blockedUntil).toLocaleString([], {
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null,
)

// --- Sample listening (training only, before interference) ----------------
const sampleTimbre = ref(0)
const sounding = ref<PitchClass | null>(null)
let soundingTimer: ReturnType<typeof setTimeout> | undefined
async function playSample(pc: PitchClass) {
  sounding.value = pc
  clearTimeout(soundingTimer)
  soundingTimer = setTimeout(() => (sounding.value = null), 900)
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
    const seqSpec: SequenceSpec = { ...props.spec }
    if (props.spec.focus) {
      seqSpec.weights = drillWeights(
        props.spec.focus.pitch,
        props.spec.focus.partners,
        props.spec.pitchSet,
      )
    } else if (props.spec.adaptive) {
      const recent = await recentTrainingTrials(db, 300)
      seqSpec.weights = adaptiveWeights(recent, props.spec.pitchSet)
      seqSpec.partners = confusionPartners(recent, props.spec.pitchSet)
    }
    const sequence = generateSequence(seqSpec, (t) => getTimbre(t).range, rng)
    const byTimbre = new Map<string, number[]>()
    for (const s of sequence) byTimbre.set(s.timbre, [...(byTimbre.get(s.timbre) ?? []), s.midi])
    await Promise.all([...byTimbre].map(([t, midis]) => audio.preload(t, midis)))

    if (E2E) e2eSequence.value = sequence
    // Countdown over the (disabled) wheel; the runner only starts after "Go".
    cancelled = false
    handled = -1
    combo.value = 0
    bestCombo.value = 0
    results.value = []
    state.value = null
    counting.value = true
    stage.value = 'running'
    await nextTick()
    document.querySelector('section.run')?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    await new Promise<void>((resolve) => (countdownDone = resolve))
    countdownDone = null
    counting.value = false
    if (cancelled) return
    const session = await startSession(db, { levelId: props.spec.id, kind: props.spec.kind })
    if (cancelled) return
    const startedAt = performance.now()
    runner = new LevelRunner(props.spec, sequence, {
      audio,
      rng,
      onState: (s) => (state.value = s),
      onTrial: (t) => saveTrial(db, t, session.id, props.spec.id),
      ...(E2E ? E2E_TIMING : {}),
    })
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

function answer(a: WheelAnswer, timeStamp: number) {
  runner?.respond(a, timeStamp)
}

function quit(reason = 'You left the level.') {
  if (!runner) {
    // Stopped during the countdown: nothing has started yet.
    if (!counting.value) return
    cancelled = true
    counting.value = false
    countdownDone?.()
    emit('aborted', reason)
    return
  }
  runner.abort()
  runner = null
  clearInterval(ticker)
  emit('aborted', reason)
}

function onCountdownDone() {
  countdownDone?.()
}

// Feedback levels only: celebrate / correct, never on no-feedback levels or tests.
let handled = -1
watch(
  () => state.value?.feedback,
  async (fb) => {
    if (!fb || !props.spec.feedback || state.value?.phase !== 'feedback') return
    const idx = state.value.index
    if (idx === handled) return
    handled = idx
    results.value[idx] = fb.correct ? 'ok' : 'bad'
    combo.value = fb.correct ? combo.value + 1 : 0
    bestCombo.value = Math.max(bestCombo.value, combo.value)
    await nextTick()
    const root = wheel.value?.$el as HTMLElement | undefined
    const rightKey = root?.querySelector('.correct')
    if (fb.correct) {
      if (rightKey) {
        pulse(rightKey, 'ok')
        popText(rightKey, `+${fb.points}`, 'ok')
      }
      haptic('ok')
    } else {
      const wrongKey = root?.querySelector('.wrong')
      if (wrongKey) shake(wrongKey)
      if (rightKey) pulse(rightKey, 'ok')
      haptic('bad')
    }
  },
)

function onVisibility() {
  if (document.hidden && stage.value === 'running') {
    quit('The level was stopped because the app went into the background.')
  }
}

onMounted(() => document.addEventListener('visibilitychange', onVisibility))
onBeforeUnmount(() => {
  emit('running', false)
  document.removeEventListener('visibilitychange', onVisibility)
  cancelled = true
  runner?.abort()
  clearInterval(ticker)
  clearTimeout(soundingTimer)
  countdownDone?.()
})
</script>

<template>
  <section v-if="stage !== 'running'" class="card intro">
    <header class="head">
      <div>
        <p class="kicker">
          {{ isTest ? 'Test' : spec.focus ? 'Focus drill' : spec.final ? 'Mastery' : 'Training' }}
        </p>
        <h2>{{ spec.title }}</h2>
      </div>
    </header>

    <div v-if="!isTest" class="pitches" data-tour="level-pitches">
      <button
        v-for="pc in spec.pitchSet"
        :key="pc"
        type="button"
        class="pchip"
        :class="{ playing: sounding === pc }"
        :aria-label="`Play ${PITCH_CLASS_NAMES_SHARP[pc]}`"
        @click="playSample(pc)"
      >
        <span class="pn">{{ PITCH_CLASS_NAMES_SHARP[pc] }}</span>
        <svg class="play" viewBox="0 0 10 10" width="9" height="9" aria-hidden="true">
          <path d="M2 1l7 4-7 4z" fill="currentColor" />
        </svg>
      </button>
    </div>

    <ul class="facts" data-tour="level-facts">
      <li>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 18V6l10-2v12" />
          <circle cx="7" cy="18" r="2.5" />
          <circle cx="17" cy="16" r="2.5" />
        </svg>
        <span>
          <strong>{{ spec.trials }}</strong> notes
        </span>
      </li>
      <li>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="13" r="8" />
          <path d="M12 9v4l2.5 2M9.5 3h5" />
        </svg>
        <span>
          answer within <strong>{{ spec.deadlineMs / 1000 }} s</strong>
        </span>
      </li>
      <li>
        <svg v-if="spec.feedback" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
        <svg v-else viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M3 3l18 18M10.6 6.2A9.6 9.6 0 0 1 12 6c6 0 10 6 10 6a17 17 0 0 1-3.2 3.7M6.2 8.2A16 16 0 0 0 2 12s4 7 10 7a9.5 9.5 0 0 0 4-.9"
          />
        </svg>
        <span>{{ spec.feedback ? 'with feedback' : 'no feedback' }}</span>
      </li>
      <li v-if="spec.kind === 'train'" class="pass">
        <span class="tag">Pass at {{ passPct }}%</span>
      </li>
    </ul>
    <p class="muted setup">{{ timbreLabels.join(' · ') }} · {{ octaveLabel }}</p>

    <div v-if="hasNotes" class="pills">
      <span v-if="spec.allowNone" class="pill">Some notes are not in your set</span>
      <span v-if="spec.specialRate > 0" class="pill">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3l2.7 5.8 6.3.7-4.7 4.3 1.3 6.2L12 17l-5.6 3 1.3-6.2L3 9.5l6.3-.7z" />
        </svg>
        3-point notes
      </span>
      <span v-if="spec.focus" class="pill">
        Extra practice on <strong>{{ PITCH_CLASS_NAMES_SHARP[spec.focus.pitch] }}</strong>
      </span>
      <span v-if="spec.final" class="pill">Mastery level</span>
      <span v-if="spec.interference" class="pill">15-second sliding tone first</span>
    </div>
    <details v-if="hasNotes" class="more">
      <summary>How this level works</summary>
      <p v-if="spec.allowNone">
        Answer those with “Not in my set” (key N) — it counts as a correct answer.
      </p>
      <p v-if="spec.specialRate > 0">Notes marked with a star are worth 3 points.</p>
      <p v-if="spec.focus">
        Your weakest pitch in the last levels{{
          specialNames ? `, mixed with the notes you confuse it with (${specialNames})` : ''
        }}.
      </p>
      <p v-if="spec.final">
        Pass it four times; the fourth pass must be at least 12 hours after the third, so it shows
        long-term memory, not just today's practice.
      </p>
      <p v-if="spec.interference">
        A sliding tone plays first to clear your memory of the reference notes. No humming or
        comparing — name each note on its own.
      </p>
    </details>

    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="blockedText" class="note" role="status">
      Come back after <strong>{{ blockedText }}</strong> for the final pass.
    </p>
    <button
      class="btn btn-primary start"
      data-tour="level-start"
      :disabled="stage === 'loading' || !!blockedUntil"
      @click="start"
    >
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
      <span class="counter" :aria-label="`Note ${(state?.index ?? 0) + 1} of ${total}`">{{
        counter
      }}</span>
      <span v-if="spec.feedback" class="points" aria-label="points">
        {{ state?.points ?? 0 }}<small>pts</small>
      </span>
      <ComboMeter v-if="spec.feedback" class="combo" :combo="combo" :best="bestCombo" />
      <button class="btn btn-ghost stop" @click="quit()">Stop</button>
    </div>
    <ProgressTrack
      :total="total"
      :index="state?.index ?? 0"
      :results="spec.feedback ? results : undefined"
    />

    <div class="stage">
      <PitchWheel
        ref="wheel"
        :options="spec.responseOptions"
        :allow-none="spec.allowNone"
        :disabled="state?.phase !== 'listening'"
        :correct="highlight.correct"
        :wrong="highlight.wrong"
        @answer="answer"
      >
        <div class="status" aria-live="polite">
          <template v-if="state?.phase === 'interference'">
            <svg class="sweep" viewBox="0 0 100 100" aria-hidden="true">
              <circle cx="50" cy="50" r="46" class="sweep-track" />
              <circle cx="50" cy="50" r="46" class="sweep-arc" pathLength="100" />
            </svg>
            <span class="big">{{ countdown }}</span>
            <span class="muted lbl">clearing</span>
          </template>
          <template v-else-if="state?.phase === 'listening'">
            <SoundRipple active />
            <svg v-if="state.special" class="glyph star" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 3l2.7 5.8 6.3.7-4.7 4.3 1.3 6.2L12 17l-5.6 3 1.3-6.2L3 9.5l6.3-.7z" />
            </svg>
            <svg v-else class="glyph" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9 18V6l10-2v12" />
              <circle cx="7" cy="18" r="2.5" />
              <circle cx="17" cy="16" r="2.5" />
            </svg>
            <span class="muted lbl">{{ state.special ? '3 points' : 'which note?' }}</span>
          </template>
          <template v-else-if="state?.phase === 'feedback' && state.feedback">
            <span class="big" :class="state.feedback.correct ? 'ok' : 'bad'">
              {{ PITCH_CLASS_NAMES_SHARP[state.feedback.target] }}
            </span>
            <span class="muted lbl">
              <template v-if="state.feedback.response === 'timeout'">too slow</template>
              <template v-else-if="state.feedback.isDistractor">not in your set</template>
              <template v-else-if="state.feedback.correct && state.feedback.points > 1">
                +{{ state.feedback.points }}
              </template>
              <template v-else>{{ state.feedback.correct ? 'correct' : 'it was' }}</template>
            </span>
          </template>
        </div>
      </PitchWheel>
      <div v-if="counting" class="veil">
        <Countdown @done="onCountdownDone" />
      </div>
    </div>
  </section>
</template>

<style scoped>
.head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
}
.head h2 {
  margin: 0;
  font-size: clamp(1.5rem, 3.2vw, 1.9rem);
  line-height: 1.02;
}
.kicker {
  margin: 0 0 0.35rem;
}
.pitches {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  margin: 1.5rem 0 1.25rem;
}
.pchip {
  position: relative;
  width: 3.6rem;
  height: 3.6rem;
  border-radius: 50%;
  border: 1px solid var(--text);
  background: var(--raised);
  color: var(--text);
  display: grid;
  place-items: center;
  cursor: pointer;
  font: inherit;
  transition:
    transform 0.12s var(--ease-out),
    border-color 0.12s,
    background-color 0.12s;
}
.pchip:hover {
  border-color: var(--accent);
  color: var(--accent-ink);
}
.pchip:active {
  transform: scale(0.94);
}
.pn {
  font-family: var(--display);
  font-size: 1.6rem;
  line-height: 1;
}
.play {
  position: absolute;
  bottom: 0.45rem;
  opacity: 0.45;
}
.pchip.playing {
  background: var(--accent-soft);
  border-color: var(--accent);
  animation: chip 0.9s var(--ease-out);
}
@keyframes chip {
  from {
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 45%, transparent);
  }
  to {
    box-shadow: 0 0 0 14px transparent;
  }
}
.facts {
  list-style: none;
  padding: 1rem 0 0;
  margin: 1rem 0 0.5rem;
  border-top: 1px solid var(--line);
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem 1.75rem;
  align-items: center;
}
.facts li {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}
.facts svg {
  width: 1.3rem;
  height: 1.3rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.2;
  stroke-linecap: round;
  stroke-linejoin: round;
  color: var(--muted);
}
.pass {
  margin-left: auto;
}
.tag {
  border: 1px solid var(--accent);
  color: var(--accent-ink);
  border-radius: 999px;
  padding: 0.1rem 0.7rem;
  font-size: 0.85rem;
}
.setup {
  margin: 0 0 1rem;
  font-size: 0.85rem;
}
.pills {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.pill {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.2rem 0.75rem;
  border-radius: 999px;
  background: var(--accent-soft);
  font-size: 0.85rem;
}
.pill svg {
  width: 0.85rem;
  height: 0.85rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.4;
  stroke-linejoin: round;
}
.more {
  margin-top: 0.75rem;
  font-size: 0.9rem;
}
.more p {
  margin: 0.4rem 0;
}
.note {
  font-size: 0.9rem;
}
.start {
  margin-top: 1.5rem;
  min-width: 10rem;
}
.error {
  color: var(--bad);
}

/* Running: nothing here changes size between phases. */
.run {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.topline {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-height: 2.4rem;
}
.counter {
  font-family: var(--mono);
  font-size: 0.85rem;
  color: var(--muted);
  min-width: 5rem;
}
.points {
  font-family: var(--display);
  font-size: 1.6rem;
  line-height: 1;
  color: var(--accent-ink);
  min-width: 4.2rem;
}
.points small {
  font-family: var(--sans);
  font-size: 0.7rem;
  margin-left: 0.2rem;
  color: var(--muted);
}
.combo {
  min-width: 0;
}
.stop {
  margin-left: auto;
  padding: 0.3rem 0.5rem;
  color: var(--muted);
}
.stage {
  position: relative;
}
.veil {
  position: absolute;
  inset: 0;
  display: grid;
  background: color-mix(in srgb, var(--bg) 72%, transparent);
  border-radius: 8px;
}
.status {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.2rem;
  width: 100%;
  height: 100%;
}
.lbl {
  font-size: 0.8rem;
}
.big {
  font-family: var(--display);
  font-size: 2.6rem;
  font-weight: 400;
  line-height: 1;
}
.glyph {
  width: 2rem;
  height: 2rem;
  fill: none;
  stroke: var(--text);
  stroke-width: 1.2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.glyph.star {
  stroke: var(--accent-ink);
}
.sweep {
  position: absolute;
  inset: -4%;
  width: 108%;
  height: 108%;
  pointer-events: none;
  transform: rotate(-90deg);
}
.sweep-track {
  fill: none;
  stroke: var(--line);
  stroke-width: 1;
}
.sweep-arc {
  fill: none;
  stroke: var(--accent);
  stroke-width: 2;
  stroke-dasharray: 18 82;
  transform-origin: 50px 50px;
  animation: sweep 3.2s linear infinite;
}
@keyframes sweep {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .sweep-arc {
    animation: none;
  }
}
.ok {
  color: var(--ok);
}
.bad {
  color: var(--bad);
}
</style>
