<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import { useApStore } from '@/stores/ap'
import { MASTERY_PASSES, stepDescription, type LevelSpec } from '@/ap/protocol'
import type { LevelTransition } from '@/ap/progress'
import type { RunResult } from '@/ap/runner'
import type { LevelSummary as Summary } from '@/ap/scoring'
import { TEST_LABELS } from '@/ap/schedule'
import {
  DAILY_GOAL_MIN,
  minutesLast7Days,
  minutesOn,
  streakDays,
  WEEKLY_GOAL_MIN,
} from '@/ap/engagement'
import LevelPlayer from '@/components/ap/LevelPlayer.vue'
import LevelSummary from '@/components/ap/LevelSummary.vue'
import OnboardingFlow from '@/components/ap/OnboardingFlow.vue'
import JIcon from '@/components/ap/journey/JIcon.vue'
import { CoachTour, CountUp, HelpButton, RingGauge } from '@/components/game'
import type { TourStep } from '@/lib/tour'

const ap = useApStore()
const router = useRouter()
const result = shallowRef<{
  summary: Summary
  transition: LevelTransition | 'drill-done'
} | null>(null)
const playerKey = ref(0)
const drillSpec = shallowRef<LevelSpec | null>(null)
/** A level is being played: hide the dashboard chrome so the wheel fits the screen. */
const running = ref(false)

onMounted(async () => {
  if (!ap.loaded) await ap.load()
})

// Prepare the focus drill whenever one becomes due.
watch(
  () => ap.loaded && ap.progress.drillDue && !result.value,
  async (needed) => {
    drillSpec.value = needed ? await ap.prepareDrill() : null
  },
  { immediate: true },
)

const today = computed(() => Math.round(minutesOn(ap.sessions, ap.now)))
const week = computed(() => Math.round(minutesLast7Days(ap.sessions, ap.now)))
const streak = computed(() => streakDays(ap.sessions, ap.now))

const level = computed(() => ap.currentLevel)
const steps = computed(() => {
  const l = level.value
  if (!l) return []
  return Array.from({ length: l.stepsInTier }, (_, i) => ({
    step: i + 1,
    done: i + 1 < l.step,
    current: i + 1 === l.step,
    feedback: l.stage === 'pitch' ? (i + 1) % 2 === 1 : i === 0,
    label: l.stage === 'pitch' ? stepDescription(i + 1) : i === 0 ? 'with feedback' : 'no feedback',
  }))
})
const tierTitle = computed(() => {
  const l = level.value
  if (!l) return ''
  return l.stage === 'speed'
    ? `Speed ${l.tier} of 3 · answer within ${(l.deadlineMs / 1000).toFixed(1)} s`
    : `${l.tier} pitches`
})
const tour = ref<InstanceType<typeof CoachTour> | null>(null)
const tourSteps: TourStep[] = [
  {
    target: '[data-tour="ring"]',
    title: 'Your daily goal',
    body: 'About 30 minutes a day is the dose that worked in the studies. The ring fills as you train.',
    placement: 'bottom',
  },
  {
    target: '[data-tour="ladder"]',
    title: 'The ladder',
    body: 'Start with 3 notes and add one at a time up to 12, then speed tiers. Each tier has 8 steps.',
    placement: 'bottom',
  },
  {
    target: '[data-tour="level-pitches"]',
    title: 'Tap to hear',
    body: 'The pitches of this step. Tap one to hear it as often as you like before you start.',
    placement: 'bottom',
  },
  {
    target: '[data-tour="level-start"]',
    title: 'Start a step',
    body: 'Odd steps give feedback, even steps do not. Reach 90% to move on. Answer with the wheel or keys 1 – 0, – and =.',
    placement: 'top',
  },
  {
    target: '[data-tour="help"]',
    title: 'Need this again?',
    body: 'Tap the question mark any time to replay the tour.',
    placement: 'bottom',
  },
]

/** The ladder as a map: pitch tiers 3–12, then three speed tiers. */
const map = computed(() => {
  const l = level.value
  const cur = ap.complete ? 99 : !l ? 0 : l.stage === 'speed' ? 10 + l.tier - 1 : l.tier - 3
  return Array.from({ length: 13 }, (_, i) => ({
    key: `node-${i}`,
    label: i < 10 ? String(i + 3) : `S${i - 9}`,
    title: i < 10 ? `${i + 3} pitches` : `Speed ${i - 9}`,
    state: i < cur ? 'done' : i === cur ? 'current' : 'locked',
  }))
})
const weekHours = computed(() => Math.round((week.value / 60) * 10) / 10)
const showDash = computed(() => ap.loaded && ap.progress.onboardingDone && !!ap.pretest)
const blockedUntil = computed(() => (ap.startGate.ok ? null : ap.startGate.until))

async function onOnboardingDone(withPitchMemory: boolean) {
  await ap.finishOnboarding()
  if (withPitchMemory) await router.push({ name: 'pitch-memory', query: { next: 'pretest' } })
  else await router.push({ name: 'test', params: { kind: 'pretest' } })
}

async function onFinished(r: RunResult) {
  const transition = await ap.recordLevelResult(r.summary)
  result.value = { summary: r.summary, transition }
}

async function onDrillFinished(r: RunResult) {
  await ap.completeDrill(r.summary)
  result.value = { summary: r.summary, transition: 'drill-done' }
}

function onAborted(reason: string) {
  toast.warning(reason)
  playerKey.value++
}

function next() {
  result.value = null
  playerKey.value++
}
</script>

<template>
  <div class="head">
    <h1>Absolute pitch</h1>
    <span v-if="showDash && !running" class="help" data-tour="help">
      <HelpButton label="Show dashboard tour" @click="tour?.start()" />
    </span>
  </div>

  <p v-if="!ap.loaded" class="muted">Loading…</p>

  <OnboardingFlow
    v-else-if="!ap.progress.onboardingDone"
    :timbre="ap.timbres.trained[0]!"
    @done="onOnboardingDone"
  />

  <section v-else-if="!ap.pretest" class="card baseline">
    <h2>Take the baseline test <em>first</em></h2>
    <p class="muted">
      Your starting point is measured before training, so progress can be compared fairly later.
    </p>
    <RouterLink class="btn btn-primary" :to="{ name: 'test', params: { kind: 'pretest' } }">
      Start the test
    </RouterLink>
  </section>

  <template v-else>
    <CoachTour v-if="!running && !result" ref="tour" id="trainer" :steps="tourSteps" />

    <div v-show="!running" class="card dose">
      <div class="ring-wrap" data-tour="ring">
        <RingGauge
          :value="today / DAILY_GOAL_MIN"
          :size="148"
          :tone="today >= DAILY_GOAL_MIN ? 'ok' : 'accent'"
          :label="`today`"
        >
          <span class="ring-num">{{ today }}</span>
          <span class="ring-sub">/ {{ DAILY_GOAL_MIN }} min today</span>
        </RingGauge>
      </div>
      <div class="nums">
        <div class="num">
          <span class="big"><CountUp :value="streak" /></span>
          <span class="muted">day{{ streak === 1 ? '' : 's' }} streak</span>
        </div>
        <div class="num">
          <span class="big"><CountUp :value="ap.progress.points" /></span>
          <span class="muted">points</span>
        </div>
        <div class="week">
          <div class="week-top">
            <span class="muted">last 7 days</span>
            <span class="mono">{{ weekHours }} / {{ WEEKLY_GOAL_MIN / 60 }} h</span>
          </div>
          <div
            class="bar"
            role="progressbar"
            aria-label="Hours in the last 7 days"
            :aria-valuenow="week"
            :aria-valuemax="WEEKLY_GOAL_MIN"
          >
            <i :style="{ width: Math.min(100, (week / WEEKLY_GOAL_MIN) * 100) + '%' }" />
          </div>
        </div>
      </div>
    </div>

    <section v-for="t in running ? [] : ap.due" :key="t.kind" class="card due" role="status">
      <JIcon name="target" :size="26" class="due-icon" />
      <div class="due-text">
        <strong>{{ TEST_LABELS[t.kind] }} due.</strong>
        <span class="muted">
          Measures your progress without feedback on all 12 pitches (about 12 minutes).
        </span>
      </div>
      <RouterLink class="btn btn-primary" :to="{ name: 'test', params: { kind: t.kind } }">
        Take it now
      </RouterLink>
    </section>

    <LevelSummary
      v-if="result"
      :summary="result.summary"
      :transition="result.transition"
      :mastery-passes="ap.progress.finalPasses.length"
      @continue="next"
    />

    <template v-else-if="ap.progress.drillDue">
      <p v-if="!drillSpec" class="muted">Preparing your focus drill…</p>
      <LevelPlayer
        v-else
        :key="`drill-${playerKey}`"
        :spec="drillSpec"
        @finished="onDrillFinished"
        @aborted="onAborted"
        @running="running = $event"
      />
    </template>

    <section v-else-if="ap.complete" class="card mastered">
      <JIcon name="trophy" :size="34" class="due-icon" />
      <h2>Mastered</h2>
      <p>
        You passed every level, including the speed tiers and the four mastery passes. Take the
        final test now and the retention tests after 1 and 3 months to see how well it lasts.
      </p>
      <RouterLink class="btn" to="/progress">See your progress</RouterLink>
    </section>

    <template v-else-if="level">
      <div v-show="!running" class="tier card">
        <ol class="map" data-tour="ladder" aria-label="Ladder">
          <li
            v-for="n in map"
            :key="n.key"
            :class="n.state"
            :title="n.title"
            :aria-current="n.state === 'current' ? 'step' : undefined"
          >
            <span class="node">
              <JIcon v-if="n.state === 'done'" name="check" :size="14" />
              <JIcon v-else-if="n.state === 'locked'" name="lock" :size="12" />
              <template v-else>{{ n.label }}</template>
            </span>
            <span class="lab">{{ n.label }}</span>
          </li>
        </ol>
        <div class="tier-head">
          <strong class="tier-title">{{ tierTitle }}</strong>
          <span class="muted">{{ ap.mastered }} of 12 pitches mastered</span>
        </div>
        <ol class="steps">
          <li
            v-for="s in steps"
            :key="`step-${s.step}`"
            :class="{ done: s.done, current: s.current, nofb: !s.feedback }"
            :title="`${s.label} · ${s.feedback ? 'feedback' : 'no feedback'}`"
          >
            {{ s.step }}
          </li>
        </ol>
        <p class="muted small">
          <template v-if="level.stage === 'pitch'">{{ stepDescription(level.step) }} · </template>
          {{ level.feedback ? 'with feedback' : 'without feedback' }}
          <template v-if="level.final">
            · mastery passes {{ ap.progress.finalPasses.length }}/{{ MASTERY_PASSES }}
          </template>
        </p>
      </div>

      <div data-tour="start">
        <LevelPlayer
          :key="`${level.id}-${playerKey}`"
          :spec="level"
          :blocked-until="blockedUntil"
          @finished="onFinished"
          @aborted="onAborted"
          @running="running = $event"
        />
      </div>
    </template>
  </template>
</template>

<style scoped>
.head {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.head h1 {
  margin-bottom: 0;
}
.help {
  display: inline-flex;
  margin-top: 0.4rem;
}
h2 {
  font-family: var(--display);
  font-weight: 400;
}
h2 em {
  color: var(--accent-ink);
}
.dose {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 1.5rem 2.5rem;
  margin-bottom: 1rem;
  padding: 1.5rem 2rem;
}
.ring-num {
  font: 300 2.3rem/1.05 var(--display);
  letter-spacing: -0.02em;
}
.ring-sub {
  margin-top: 0.3rem;
  font-size: 0.72rem;
  color: var(--muted);
}
.nums {
  flex: 1;
  min-width: 14rem;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem 1.5rem;
}
.num {
  display: flex;
  flex-direction: column;
}
.big {
  font: 300 clamp(2.2rem, 6vw, 2.9rem) / 1.05 var(--display);
  letter-spacing: -0.02em;
}
.num .muted {
  font-size: 0.82rem;
}
.week {
  grid-column: 1 / -1;
}
.week-top {
  display: flex;
  justify-content: space-between;
  font-size: 0.82rem;
  margin-bottom: 0.35rem;
}
.mono {
  font-family: var(--mono);
  font-size: 0.78rem;
}
.bar {
  height: 3px;
  background: var(--line);
  border-radius: 2px;
  overflow: hidden;
}
.bar i {
  display: block;
  height: 100%;
  background: var(--text);
  transition: width 0.8s var(--ease-out);
}
.due {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem 1rem;
  margin-bottom: 1rem;
  border-color: var(--accent);
  background: var(--accent-soft);
}
.due-icon {
  color: var(--accent-ink);
}
.due-text {
  flex: 1;
  min-width: 14rem;
  display: flex;
  flex-direction: column;
}
.mastered {
  display: grid;
  gap: 0.5rem;
  justify-items: start;
}
.mastered h2 {
  margin: 0;
  font-size: 1.75rem;
}
.tier {
  margin-bottom: 1rem;
  padding: 1.25rem 1.5rem;
}
.map {
  position: relative;
  display: flex;
  justify-content: space-between;
  gap: 0.25rem;
  list-style: none;
  margin: 0 0 1.25rem;
  padding: 0.25rem 0 0;
  overflow-x: auto;
  scrollbar-width: none;
}
.map::-webkit-scrollbar {
  display: none;
}
.map li {
  position: relative;
  flex: 1 0 2.4rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.3rem;
}
/* the path between nodes */
.map li::before {
  content: '';
  position: absolute;
  top: 0.95rem;
  right: 50%;
  width: 100%;
  height: 1px;
  background: var(--border);
}
.map li:first-child::before {
  display: none;
}
.map li.done::before,
.map li.current::before {
  background: var(--accent);
  height: 2px;
  top: calc(0.95rem - 0.5px);
}
.node {
  position: relative;
  z-index: 1;
  display: grid;
  place-items: center;
  width: 1.9rem;
  height: 1.9rem;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: var(--surface);
  font: 0.78rem var(--mono);
  color: var(--muted);
}
.done .node {
  background: var(--text);
  border-color: var(--text);
  color: var(--surface);
}
.current .node {
  width: 2.2rem;
  height: 2.2rem;
  margin: -0.15rem 0;
  background: var(--accent);
  border-color: var(--accent);
  color: var(--on-accent);
  box-shadow: 0 0 0 4px var(--accent-soft);
}
.lab {
  font-size: 0.7rem;
  color: var(--muted);
}
.current .lab {
  color: var(--accent-ink);
  font-weight: 600;
}
.tier-head {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.25rem 1rem;
}
.tier-title {
  font: 400 1.5rem/1.1 var(--display);
}
.steps {
  display: flex;
  gap: 0.4rem;
  list-style: none;
  padding: 0;
  margin: 0.8rem 0 0.5rem;
}
.steps li {
  width: 1.9rem;
  height: 1.9rem;
  border-radius: 50%;
  font-family: var(--mono);
  transition:
    background-color 0.3s,
    border-color 0.3s;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--text);
  font-size: 0.75rem;
  color: var(--muted);
  opacity: 0.55;
}
.steps li.nofb {
  border-style: dashed;
}
.steps li.done {
  background: var(--text);
  color: var(--surface);
  opacity: 1;
}
.steps li.current {
  border-color: var(--accent);
  color: var(--accent-ink);
  opacity: 1;
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.small {
  font-size: 0.85rem;
  margin: 0;
}
.baseline h2 {
  font-size: 1.6rem;
  margin-top: 0;
}
</style>
