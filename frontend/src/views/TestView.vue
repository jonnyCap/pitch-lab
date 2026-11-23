<script setup lang="ts">
import { computed, onMounted, shallowRef } from 'vue'
import { RouterLink } from 'vue-router'
import { toast } from 'vue-sonner'
import { db, type TestResult } from '@/data/db'
import { getTimbre } from '@/audio/instruments'
import { testMetrics, type TestMetrics } from '@/ap/assessment'
import { saveTestResult } from '@/ap/persistence'
import type { RunResult } from '@/ap/runner'
import { useApStore } from '@/stores/ap'
import LevelPlayer from '@/components/ap/LevelPlayer.vue'

const props = defineProps<{ kind: TestResult['kind'] }>()
const ap = useApStore()
const metrics = shallowRef<TestMetrics | null>(null)
const attempt = shallowRef(0)

onMounted(() => {
  if (!ap.loaded) void ap.load()
})

const spec = computed(() => ap.testSpec(props.kind))
const title = computed(() => (props.kind === 'pretest' ? 'Baseline test' : 'Absolute pitch test'))
const trainedLabel = computed(() => getTimbre(ap.timbres.trained[0]!).label)
const untrainedLabel = computed(() => getTimbre(ap.timbres.untrained).label)

async function onFinished(r: RunResult) {
  const m = testMetrics(r.outcomes, {
    trainedTimbres: ap.timbres.trained,
    trainedOctaves: [4, 5, 6],
  })
  await saveTestResult(db, props.kind, {
    ...m,
    timbres: spec.value.timbres,
    trials: r.outcomes.length,
  })
  await ap.refreshTests()
  metrics.value = m
}

function onAborted(reason: string) {
  toast.warning(`${reason} The test was not saved — please start it again.`)
  attempt.value++
}

const pct = (x: number) => `${Math.round(x * 100)}%`
const sec = (ms: number | null) => (ms === null ? '–' : `${(ms / 1000).toFixed(2)} s`)
const mad = (x: number | null) => (x === null ? '–' : x.toFixed(2))
</script>

<template>
  <h1>{{ title }}</h1>

  <template v-if="!metrics">
    <p class="muted">
      Name each note as quickly as you can, without feedback. Notes come from octaves 3–6 on
      {{ trainedLabel }} and {{ untrainedLabel }}; consecutive notes are always more than an octave
      apart. If you don't know, take your best guess.
    </p>
    <LevelPlayer
      v-if="ap.loaded"
      :key="attempt"
      :spec="spec"
      @finished="onFinished"
      @aborted="onAborted"
    />
  </template>

  <section v-else class="card">
    <h2>Your result</h2>
    <div class="grid stats">
      <div>
        <div class="value">{{ pct(metrics.accuracy) }}</div>
        <div class="muted">exactly right (chance ≈ 8%)</div>
      </div>
      <div>
        <div class="value">{{ pct(metrics.accuracyWithin1) }}</div>
        <div class="muted">within one semitone</div>
      </div>
      <div>
        <div class="value">{{ mad(metrics.mad) }}</div>
        <div class="muted">average error in semitones (chance ≈ 3)</div>
      </div>
      <div>
        <div class="value">{{ sec(metrics.medianRtMs) }}</div>
        <div class="muted">median response time</div>
      </div>
    </div>
    <table>
      <thead>
        <tr>
          <th></th>
          <th>Exact</th>
          <th>Avg. error</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Trained conditions ({{ trainedLabel }}, octaves 4–6)</td>
          <td>{{ pct(metrics.trained.accuracy) }}</td>
          <td>{{ mad(metrics.trained.mad) }}</td>
        </tr>
        <tr>
          <td>Untrained ({{ untrainedLabel }} or octave 3)</td>
          <td>{{ pct(metrics.untrained.accuracy) }}</td>
          <td>{{ mad(metrics.untrained.mad) }}</td>
        </tr>
      </tbody>
    </table>
    <p class="muted">
      These numbers are your baseline. Retake the test after training to see what changed.
    </p>
    <RouterLink class="btn btn-primary" to="/trainer">Go to training</RouterLink>
  </section>
</template>

<style scoped>
.stats {
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  margin: 1rem 0;
}
.value {
  font-size: 1.8rem;
  font-weight: 800;
}
table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 1rem;
}
th,
td {
  text-align: left;
  padding: 0.35rem 0.25rem;
  border-bottom: 1px solid var(--border);
}
</style>
