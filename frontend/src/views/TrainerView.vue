<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import { useApStore } from '@/stores/ap'
import { stepDescription, STEPS_PER_TIER } from '@/ap/protocol'
import type { LevelTransition } from '@/ap/progress'
import type { RunResult } from '@/ap/runner'
import type { LevelSummary as Summary } from '@/ap/scoring'
import LevelPlayer from '@/components/ap/LevelPlayer.vue'
import LevelSummary from '@/components/ap/LevelSummary.vue'
import OnboardingFlow from '@/components/ap/OnboardingFlow.vue'

const ap = useApStore()
const router = useRouter()
const result = shallowRef<{ summary: Summary; transition: LevelTransition } | null>(null)
const playerKey = ref(0)

onMounted(() => {
  if (!ap.loaded) void ap.load()
})

const tierSteps = computed(() => {
  const level = ap.currentLevel
  if (!level) return []
  return Array.from({ length: STEPS_PER_TIER }, (_, i) => ({
    step: i + 1,
    done: i + 1 < level.step,
    current: i + 1 === level.step,
    label: stepDescription(i + 1),
    feedback: (i + 1) % 2 === 1,
  }))
})

async function onOnboardingDone() {
  await ap.finishOnboarding()
  await router.push({ name: 'test', params: { kind: 'pretest' } })
}

async function onFinished(r: RunResult) {
  const transition = await ap.recordLevelResult(r.summary.passed)
  result.value = { summary: r.summary, transition }
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

  <section v-else-if="ap.complete" class="card">
    <h2>Ladder complete 🎉</h2>
    <p>
      You passed every level with all 12 pitches. Speed training and retention checks arrive in the
      next update.
    </p>
  </section>

  <template v-else-if="ap.currentLevel">
    <div class="tier card">
      <div class="tier-head">
        <strong>{{ ap.currentLevel.tier }} pitches</strong>
        <span class="muted">{{ ap.mastered }} of 12 mastered</span>
      </div>
      <ol class="steps">
        <li
          v-for="s in tierSteps"
          :key="s.step"
          :class="{ done: s.done, current: s.current }"
          :title="`${s.label} · ${s.feedback ? 'feedback' : 'no feedback'}`"
        >
          {{ s.step }}
        </li>
      </ol>
      <p class="muted small">
        {{ stepDescription(ap.currentLevel.step) }} ·
        {{ ap.currentLevel.feedback ? 'with feedback' : 'without feedback' }}
      </p>
    </div>

    <LevelSummary
      v-if="result"
      :summary="result.summary"
      :transition="result.transition"
      @continue="next"
    />
    <LevelPlayer
      v-else
      :key="`${ap.currentLevel.id}-${playerKey}`"
      :spec="ap.currentLevel"
      @finished="onFinished"
      @aborted="onAborted"
    />
  </template>
</template>

<style scoped>
.tier {
  margin-bottom: 1rem;
  padding: 0.9rem 1.25rem;
}
.tier-head {
  display: flex;
  justify-content: space-between;
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
.steps li:nth-child(even) {
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
