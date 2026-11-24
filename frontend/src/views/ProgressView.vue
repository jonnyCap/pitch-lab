<script setup lang="ts">
import { computed, onMounted, shallowRef } from 'vue'
import { RouterLink } from 'vue-router'
import { db, type Trial } from '@/data/db'
import { PITCH_CLASS_NAMES_SHARP } from '@/music/pitch'
import { formatDuration, perPitchAccuracy, totalActiveMs, trainingDays } from '@/ap/stats'
import { dailySeries, streakDays, DAILY_GOAL_MIN } from '@/ap/engagement'
import { AP_BAND_LABELS, type APBand } from '@/ap/assessment'
import { AP_TEST_KINDS, TEST_LABELS } from '@/ap/schedule'
import { pitchMemoryBand } from '@/ap/pitchMemory'
import { useApStore } from '@/stores/ap'
import ColumnChart from '@/components/charts/ColumnChart.vue'
import TrendChart from '@/components/charts/TrendChart.vue'

const ap = useApStore()
const recent = shallowRef<Trial[]>([])
const RECENT_N = 500

onMounted(async () => {
  if (!ap.loaded) await ap.load()
  else await Promise.all([ap.refreshSessions(), ap.refreshTests()])
  const latest = await db.trials
    .where('[module+ts]')
    .between(['ap', 0], ['ap', Infinity])
    .reverse()
    .limit(RECENT_N * 2)
    .toArray()
  recent.value = latest.filter((t) => !t.levelId.startsWith('test-')).slice(0, RECENT_N)
})

const hours = computed(() => formatDuration(totalActiveMs(ap.sessions)))
const days = computed(() => trainingDays(ap.sessions))
const streak = computed(() => streakDays(ap.sessions, ap.now))
const pitchAcc = computed(() => perPitchAccuracy(recent.value.filter((t) => !t.isDistractor)))

const apTests = computed(() => ap.tests.filter((t) => AP_TEST_KINDS.includes(t.kind)))
const latestBand = computed(
  () => (apTests.value.at(-1)?.metrics.band as APBand | undefined) ?? null,
)
const memory = computed(() => ap.tests.filter((t) => t.kind === 'pitch_memory').at(-1) ?? null)

const stage = computed(() => {
  const l = ap.currentLevel
  if (!l) return { value: 'Done', sub: 'ladder complete' }
  if (l.stage === 'speed')
    return { value: `Speed ${l.tier}`, sub: `step ${l.step}/2 · ${l.deadlineMs / 1000} s` }
  return { value: String(l.tier), sub: `pitches in training · step ${l.step}/8` }
})

const minutesSeries = computed(() =>
  dailySeries(ap.sessions, ap.now, 28).map((d) => ({
    key: d.day,
    label: new Date(`${d.day}T12:00`).toLocaleDateString([], { day: 'numeric', month: 'short' }),
    value: d.minutes,
  })),
)

const accuracyTrend = computed(() =>
  apTests.value.map((t) => ({
    key: t.id,
    t: t.takenAt,
    value: (t.metrics.accuracy as number) ?? 0,
    label: `${TEST_LABELS[t.kind]} · ${new Date(t.takenAt).toLocaleDateString()}`,
  })),
)

const pct = (x: number) => `${Math.round(x * 100)}%`
const date = (ts: number) => new Date(ts).toLocaleDateString()
const metric = (m: Record<string, unknown>, k: string) => m[k] as number | null
</script>

<template>
  <h1>Progress</h1>

  <div class="grid kpis">
    <div class="card stat">
      <div class="value">{{ ap.mastered }}<small>/12</small></div>
      <div class="muted">pitches mastered</div>
    </div>
    <div class="card stat">
      <div class="value">{{ stage.value }}</div>
      <div class="muted">{{ stage.sub }}</div>
    </div>
    <div class="card stat">
      <div class="value">{{ hours }}</div>
      <div class="muted">training · {{ days }} day{{ days === 1 ? '' : 's' }}</div>
    </div>
    <div class="card stat">
      <div class="value">{{ streak }}<small> d</small></div>
      <div class="muted">streak · {{ ap.progress.points }} points</div>
    </div>
  </div>

  <section v-if="latestBand" class="card block band-card">
    <div>
      <div class="muted small">Latest test</div>
      <div class="band">{{ AP_BAND_LABELS[latestBand] }}</div>
      <div class="muted small">Indicative, not a diagnosis.</div>
    </div>
    <div v-if="ap.upcoming.length" class="upcoming">
      <div v-for="t in ap.upcoming" :key="t.kind">
        <strong>{{ TEST_LABELS[t.kind] }}</strong>
        <span class="muted">
          {{ t.dueAt <= ap.now ? 'due now' : `from ${date(t.dueAt)}` }}
        </span>
      </div>
    </div>
  </section>

  <section class="card block">
    <ColumnChart
      title="Training minutes per day (last 4 weeks)"
      :data="minutesSeries"
      unit="min"
      :goal="DAILY_GOAL_MIN"
      :goal-label="`goal ${DAILY_GOAL_MIN} min`"
      :label-every="7"
    />
  </section>

  <section class="card block">
    <TrendChart
      v-if="accuracyTrend.length"
      title="Test accuracy (exact pitch)"
      :points="accuracyTrend"
      :reference="1 / 12"
      reference-label="chance"
    />
    <p v-else class="muted">No test taken yet.</p>
    <table v-if="apTests.length">
      <thead>
        <tr>
          <th>Date</th>
          <th>Test</th>
          <th>Exact</th>
          <th>Avg. error</th>
          <th>Untrained</th>
          <th>Level</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="t in apTests" :key="t.id">
          <td>{{ date(t.takenAt) }}</td>
          <td>{{ TEST_LABELS[t.kind] }}</td>
          <td class="num">{{ pct(metric(t.metrics, 'accuracy') ?? 0) }}</td>
          <td class="num">{{ (metric(t.metrics, 'mad') ?? 0).toFixed(2) }}</td>
          <td class="num">
            {{ pct((t.metrics.untrained as { accuracy: number } | undefined)?.accuracy ?? 0) }}
          </td>
          <td>{{ t.metrics.band ? AP_BAND_LABELS[t.metrics.band as APBand] : '–' }}</td>
        </tr>
      </tbody>
    </table>
    <RouterLink v-if="ap.pretest" class="btn" :to="{ name: 'test', params: { kind: 'weekly' } }">
      Take a test now
    </RouterLink>
  </section>

  <section class="card block">
    <h2>Accuracy per pitch</h2>
    <p v-if="recent.length" class="muted small">Last {{ recent.length }} training notes.</p>
    <p v-if="!pitchAcc.length" class="muted">No training yet.</p>
    <ul class="bars">
      <li v-for="p in pitchAcc" :key="p.pitchClass">
        <span class="pc">{{ PITCH_CLASS_NAMES_SHARP[p.pitchClass] }}</span>
        <span class="bar"><span :style="{ width: pct(p.accuracy) }" /></span>
        <span class="muted num">{{ pct(p.accuracy) }} · {{ p.n }}</span>
      </li>
    </ul>
  </section>

  <section class="card block">
    <h2>Pitch memory</h2>
    <p v-if="memory">
      Average matching error
      <strong>{{ Math.round(metric(memory.metrics, 'meanAbsCents') ?? 0) }} cents</strong> ({{
        pitchMemoryBand(metric(memory.metrics, 'meanAbsCents') ?? 0).replace('-', ' ')
      }}) on {{ date(memory.takenAt) }}.
    </p>
    <p v-else class="muted">Optional 3-minute check of how precisely you remember a single tone.</p>
    <RouterLink class="btn" to="/pitch-memory">{{
      memory ? 'Check again' : 'Start the check'
    }}</RouterLink>
  </section>
</template>

<style scoped>
.kpis {
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
}
.stat .value {
  font-size: 1.8rem;
  font-weight: 800;
}
.stat small {
  font-size: 1rem;
  color: var(--muted);
}
.block {
  margin-top: 1rem;
}
.block h2 {
  margin: 0;
  font-size: 1.15rem;
}
.small {
  font-size: 0.85rem;
}
.band-card {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 1rem;
}
.band {
  font-size: 1.4rem;
  font-weight: 800;
}
.upcoming {
  display: grid;
  gap: 0.25rem;
  align-content: center;
}
.upcoming div {
  display: flex;
  gap: 0.5rem;
}
.bars {
  list-style: none;
  padding: 0;
  display: grid;
  gap: 0.35rem;
}
.bars li {
  display: grid;
  grid-template-columns: 2.5rem 1fr 6rem;
  align-items: center;
  gap: 0.5rem;
}
.pc {
  font-weight: 700;
}
.bar {
  height: 0.6rem;
  border-radius: 999px;
  background: var(--grid);
  overflow: hidden;
}
.bar span {
  display: block;
  height: 100%;
  background: var(--series);
}
table {
  width: 100%;
  border-collapse: collapse;
  margin: 0.75rem 0;
}
th,
td {
  text-align: left;
  padding: 0.35rem 0.25rem;
  border-bottom: 1px solid var(--border);
}
.num {
  font-variant-numeric: tabular-nums;
}
</style>
