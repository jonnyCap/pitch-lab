<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue'
import { RouterLink } from 'vue-router'
import { toast } from 'vue-sonner'
import { db, type TestResult } from '@/data/db'
import { getTimbre } from '@/audio/instruments'
import {
  AP_BAND_LABELS,
  classify,
  testMetrics,
  type APBand,
  type TestMetrics,
} from '@/ap/assessment'
import { TEST_LABELS } from '@/ap/schedule'
import { saveTestResult } from '@/ap/persistence'
import type { RunResult } from '@/ap/runner'
import { useApStore } from '@/stores/ap'
import LevelPlayer from '@/components/ap/LevelPlayer.vue'
import { CountUp, ResultStamp, RingGauge } from '@/components/game'

const props = defineProps<{ kind: TestResult['kind'] }>()
const ap = useApStore()
const metrics = shallowRef<TestMetrics | null>(null)
const band = shallowRef<APBand | null>(null)
/** Baseline captured before this test is saved (for the comparison). */
const baseline = shallowRef<TestMetrics | null>(null)
const attempt = shallowRef(0)
/** The test is running: the briefing is hidden so nothing competes with the wheel. */
const running = ref(false)

onMounted(() => {
  if (!ap.loaded) void ap.load()
})

const spec = computed(() => ap.testSpec(props.kind))
const title = computed(() => TEST_LABELS[props.kind])
const trainedLabel = computed(() => getTimbre(ap.timbres.trained[0]!).label)
const untrainedLabel = computed(() => getTimbre(ap.timbres.untrained).label)

async function onFinished(r: RunResult) {
  const m = testMetrics(r.outcomes, {
    trainedTimbres: ap.timbres.trained,
    trainedOctaves: [4, 5, 6],
  })
  const b = classify(m)
  baseline.value =
    props.kind === 'pretest' ? null : ((ap.pretest?.metrics as unknown as TestMetrics) ?? null)
  await saveTestResult(db, props.kind, {
    ...m,
    band: b,
    timbres: spec.value.timbres,
    trials: r.outcomes.length,
  })
  band.value = b
  await ap.refreshTests()
  metrics.value = m
}

function onAborted(reason: string) {
  toast.warning(`${reason} The test was not saved — please start it again.`)
  attempt.value++
  running.value = false
}

const pct = (x: number) => `${Math.round(x * 100)}%`
const mad = (x: number | null) => (x === null ? '–' : x.toFixed(2))
/** Percentage-point change vs the baseline, with direction (null = no baseline). */
const accDelta = computed(() => {
  if (!metrics.value || !baseline.value) return null
  const d = Math.round((metrics.value.accuracy - baseline.value.accuracy) * 100)
  return { text: d === 0 ? '±0 pts' : `${d > 0 ? '+' : ''}${d} pts`, dir: Math.sign(d) }
})
const madDelta = computed(() => {
  if (!metrics.value || !baseline.value) return null
  const d = (metrics.value.mad ?? 0) - (baseline.value.mad ?? 0)
  return { dir: -Math.sign(Math.round(d * 100)) }
})
</script>

<template>
  <h1>{{ title }}</h1>

  <template v-if="!metrics">
    <section v-show="!running" class="brief">
      <p class="dek">
        Take your best guess on every note — you won't see right or wrong. About 12 minutes; stay on
        this screen.
      </p>
      <details>
        <summary>Details</summary>
        <p class="muted">
          Name each note as quickly as you can, without feedback. Notes come from octaves 3–6 on
          {{ trainedLabel }} and {{ untrainedLabel }}; consecutive notes are always more than an
          octave apart. If you don't know, take your best guess.
        </p>
      </details>
    </section>
    <LevelPlayer
      v-if="ap.loaded"
      :key="attempt"
      :spec="spec"
      @finished="onFinished"
      @aborted="onAborted"
      @running="running = $event"
    />
  </template>

  <section v-else class="card result">
    <h2>Your result</h2>
    <div v-if="band" class="band-row" :data-band="band">
      <ResultStamp :text="AP_BAND_LABELS[band]" tone="ink" />
      <small class="muted">indicative, not a diagnosis</small>
    </div>

    <div class="grid stats">
      <div class="stat hero">
        <RingGauge :value="metrics.accuracy" :size="168" :reference="0.08" label="exactly right">
          <span class="value" :data-final="pct(metrics.accuracy)">
            <CountUp :value="Math.round(metrics.accuracy * 100)" suffix="%" />
          </span>
        </RingGauge>
        <div class="muted">exactly right (chance ≈ 8%)</div>
      </div>
      <div class="stat">
        <div class="value" :data-final="pct(metrics.accuracyWithin1)">
          <CountUp :value="Math.round(metrics.accuracyWithin1 * 100)" suffix="%" :duration="1100" />
        </div>
        <div class="muted">within one semitone</div>
      </div>
      <div class="stat">
        <div class="value" :data-final="mad(metrics.mad)">
          <CountUp
            v-if="metrics.mad !== null"
            :value="metrics.mad"
            :decimals="2"
            :duration="1200"
          />
          <template v-else>–</template>
        </div>
        <div class="muted">average error in semitones (chance ≈ 3)</div>
      </div>
      <div class="stat">
        <div
          class="value"
          :data-final="
            metrics.medianRtMs === null ? '–' : (metrics.medianRtMs / 1000).toFixed(2) + ' s'
          "
        >
          <CountUp
            v-if="metrics.medianRtMs !== null"
            :value="metrics.medianRtMs / 1000"
            :decimals="2"
            suffix=" s"
            :duration="1300"
          />
          <template v-else>–</template>
        </div>
        <div class="muted">median response time</div>
      </div>
    </div>

    <div
      v-if="baseline && accDelta && madDelta"
      class="deltas"
      aria-label="Compared with your baseline"
    >
      <span class="chip" :class="{ up: accDelta.dir > 0, down: accDelta.dir < 0 }">
        <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
          <path v-if="accDelta.dir >= 0" d="M6 10V2M2.5 5.5L6 2l3.5 3.5" />
          <path v-else d="M6 2v8M2.5 6.5L6 10l3.5-3.5" />
        </svg>
        <strong>{{ accDelta.text }}</strong> exactly right vs baseline
      </span>
      <span class="chip" :class="{ up: madDelta.dir > 0, down: madDelta.dir < 0 }">
        <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
          <path v-if="madDelta.dir >= 0" d="M6 10V2M2.5 5.5L6 2l3.5 3.5" />
          <path v-else d="M6 2v8M2.5 6.5L6 10l3.5-3.5" />
        </svg>
        average error <strong>{{ mad(baseline.mad) }} → {{ mad(metrics.mad) }}</strong> semitones
      </span>
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
    <p v-if="kind === 'pretest'" class="muted">
      These numbers are your baseline. Weekly tests during training show what changed.
    </p>
    <RouterLink class="btn btn-primary" to="/trainer">Go to training</RouterLink>
  </section>
</template>

<style scoped>
.dek {
  font-family: var(--display);
  font-size: 1.2rem;
  color: var(--muted);
  margin: -0.25rem 0 0.5rem;
  max-width: 38rem;
}
.brief {
  margin-bottom: 1rem;
}
.result h2 {
  font-family: var(--display);
  font-weight: 400;
  font-size: 1.6rem;
  margin-top: 0;
}
.band-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1.25rem;
  margin: 0.25rem 0 0.75rem 0.5rem;
}
.stats {
  grid-template-columns: auto 1fr;
  margin: 1rem 0;
  gap: 0 2.5rem;
  align-items: center;
}
.stat:not(.hero) {
  padding: 0.9rem 0;
  border-top: 1px solid var(--line);
}
.stat:nth-child(2) {
  border-top: 0;
}
.stat {
  animation: reveal 0.5s var(--ease-out) both;
}
.stat:nth-child(2) {
  animation-delay: 0.12s;
}
.stat:nth-child(3) {
  animation-delay: 0.22s;
}
.stat:nth-child(4) {
  animation-delay: 0.32s;
}
.stat .muted {
  font-size: 0.85rem;
}
.hero {
  grid-row: span 3;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  text-align: center;
}
.value {
  font-family: var(--display);
  font-size: 2.2rem;
  line-height: 1.1;
  letter-spacing: -0.02em;
}
.hero .value {
  font-size: 2.6rem;
}
.deltas {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 1.25rem;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.3rem 0.7rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  font-size: 0.85rem;
  animation: reveal 0.45s var(--ease-out) 0.5s both;
}
.chip svg {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.chip.up {
  color: var(--ok);
  border-color: currentColor;
}
.chip.down {
  color: var(--bad);
  border-color: currentColor;
}
.chip strong {
  font-weight: 600;
}
@keyframes reveal {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
}
table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 1rem;
  font-size: 0.92rem;
}
th,
td {
  text-align: left;
  padding: 0.45rem 0.25rem;
  border-bottom: 1px solid var(--line);
}
th {
  font-weight: 500;
  color: var(--muted);
}
@media (max-width: 640px) {
  .stats {
    grid-template-columns: 1fr;
  }
  .hero {
    grid-row: auto;
    margin-bottom: 0.5rem;
  }
  .stat:nth-child(2) {
    border-top: 1px solid var(--line);
  }
}
</style>
