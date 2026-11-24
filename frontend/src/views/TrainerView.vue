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
  <h1>Absolute pitch</h1>

  <p v-if="!ap.loaded" class="muted">Loading…</p>

  <OnboardingFlow
    v-else-if="!ap.progress.onboardingDone"
    :timbre="ap.timbres.trained[0]!"
    @done="onOnboardingDone"
  />

  <section v-else-if="!ap.pretest" class="card">
    <h2>Take the baseline test first</h2>
    <p>
      Your starting point is measured before training, so progress can be compared fairly later.
    </p>
    <RouterLink class="btn btn-primary" :to="{ name: 'test', params: { kind: 'pretest' } }">
      Start the test
    </RouterLink>
  </section>

  <template v-else>
    <div v-show="!running" class="dose grid">
      <div class="card stat">
        <div class="value">
          {{ today }}<small>/{{ DAILY_GOAL_MIN }} min</small>
        </div>
        <div class="muted">today</div>
        <progress :value="Math.min(today, DAILY_GOAL_MIN)" :max="DAILY_GOAL_MIN" />
      </div>
      <div class="card stat">
        <div class="value">
          {{ streak }}<small> day{{ streak === 1 ? '' : 's' }}</small>
        </div>
        <div class="muted">streak</div>
      </div>
      <div class="card stat">
        <div class="value">
          {{ Math.round((week / 60) * 10) / 10 }}<small>/{{ WEEKLY_GOAL_MIN / 60 }} h</small>
        </div>
        <div class="muted">last 7 days</div>
        <progress :value="Math.min(week, WEEKLY_GOAL_MIN)" :max="WEEKLY_GOAL_MIN" />
      </div>
      <div class="card stat">
        <div class="value">{{ ap.progress.points }}</div>
        <div class="muted">points</div>
      </div>
    </div>

    <section v-for="t in running ? [] : ap.due" :key="t.kind" class="card due" role="status">
      <strong>{{ TEST_LABELS[t.kind] }} due.</strong>
      <span class="muted">
        It measures your progress without feedback on all 12 pitches (about 12 minutes).
      </span>
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

    <section v-else-if="ap.complete" class="card">
      <h2>Mastered 🎉</h2>
      <p>
        You passed every level, including the speed tiers and the four mastery passes. Take the
        final test now and the retention tests after 1 and 3 months to see how well it lasts.
      </p>
      <RouterLink class="btn" to="/progress">See your progress</RouterLink>
    </section>

    <template v-else-if="level">
      <div v-show="!running" class="tier card">
        <div class="tier-head">
          <strong>{{ tierTitle }}</strong>
          <span class="muted">{{ ap.mastered }} of 12 pitches mastered</span>
        </div>
        <ol class="steps">
          <li
            v-for="s in steps"
            :key="s.step"
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

      <LevelPlayer
        :key="`${level.id}-${playerKey}`"
        :spec="level"
        :blocked-until="blockedUntil"
        @finished="onFinished"
        @aborted="onAborted"
        @running="running = $event"
      />
    </template>
  </template>
</template>

<style scoped>
.dose {
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  margin-bottom: 1rem;
}
.stat {
  padding: 0.75rem 1rem;
}
.stat .value {
  font-size: 1.4rem;
  font-weight: 800;
}
.stat small {
  font-size: 0.85rem;
  color: var(--muted);
  font-weight: 600;
}
.stat progress {
  width: 100%;
  height: 5px;
  accent-color: var(--accent);
}
.due {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
  border-color: var(--accent);
}
.tier {
  margin-bottom: 1rem;
  padding: 0.9rem 1.25rem;
}
.tier-head {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0.5rem;
}
.steps {
  display: flex;
  gap: 0.4rem;
  list-style: none;
  padding: 0;
  margin: 0.6rem 0 0.3rem;
}
.steps li {
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--border);
  font-weight: 600;
  font-size: 0.85rem;
  color: var(--muted);
}
.steps li.nofb {
  border-style: dashed;
}
.steps li.done {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-contrast);
}
.steps li.current {
  border-color: var(--accent);
  color: var(--text);
}
.small {
  font-size: 0.85rem;
  margin: 0;
}
</style>
