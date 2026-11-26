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
import PitchHelix from '@/components/PitchHelix.vue'
import { CountUp } from '@/components/game'

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

/** One score per pitch class (0..1), null where there is no training data yet. */
const mapValues = computed<(number | null)[]>(() => {
  const v: (number | null)[] = Array(12).fill(null)
  for (const p of pitchAcc.value) v[p.pitchClass] = p.accuracy
  return v
})
const extremes = computed(() => {
  const ranked = [...pitchAcc.value].filter((p) => p.n >= 3).sort((a, b) => b.accuracy - a.accuracy)
  if (ranked.length < 2) return null
  return { best: ranked[0]!, worst: ranked.at(-1)! }
})

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
  <header class="head">
    <p class="kicker">Report</p>
    <h1>Progress</h1>
  </header>

  <div class="kpis">
    <div class="stat">
      <div class="value"><CountUp :value="ap.mastered" /><small>/12</small></div>
      <div class="muted">pitches mastered</div>
    </div>
    <div class="stat">
      <div class="value">{{ stage.value }}</div>
      <div class="muted">{{ stage.sub }}</div>
    </div>
    <div class="stat">
      <div class="value">{{ hours }}</div>
      <div class="muted">training · {{ days }} day{{ days === 1 ? '' : 's' }}</div>
    </div>
    <div class="stat">
      <div class="value"><CountUp :value="streak" /><small> d</small></div>
      <div class="muted">streak · {{ ap.progress.points }} points</div>
    </div>
  </div>

  <section class="section map">
    <div class="map-fig">
      <PitchHelix
        :values="mapValues"
        :autoplay="false"
        :caption="`Fig. 1 — Your pitch map · ${recent.length ? `last ${recent.length} training notes` : 'no training yet'}`"
      />
    </div>
    <div class="map-text">
      <p class="kicker">01 — Pitch map</p>
      <h2>Your pitch map</h2>
      <p class="muted">
        Every pitch class has a node on every octave of the helix. Large, dark nodes are pitches you
        name accurately; hollow ones have not been trained yet.
      </p>
      <p v-if="extremes" class="extremes">
        Strongest <strong>{{ PITCH_CLASS_NAMES_SHARP[extremes.best.pitchClass] }}</strong>
        <span class="muted num">{{ pct(extremes.best.accuracy) }}</span><br />
        Needs work <strong>{{ PITCH_CLASS_NAMES_SHARP[extremes.worst.pitchClass] }}</strong>
        <span class="muted num">{{ pct(extremes.worst.accuracy) }}</span>
      </p>
      <p v-else-if="!pitchAcc.length" class="muted">Train a few levels and the map fills in.</p>
      <details v-if="pitchAcc.length" class="per-pitch">
        <summary>Accuracy per pitch</summary>
        <p class="muted small">Last {{ recent.length }} training notes.</p>
        <ul class="bars">
          <li v-for="p in pitchAcc" :key="p.pitchClass">
            <span class="pc">{{ PITCH_CLASS_NAMES_SHARP[p.pitchClass] }}</span>
            <span class="bar"><span :style="{ width: pct(p.accuracy) }" /></span>
            <span class="muted num">{{ pct(p.accuracy) }} · {{ p.n }}</span>
          </li>
        </ul>
      </details>
    </div>
  </section>

  <section v-if="latestBand" class="section band-card">
    <div>
      <p class="kicker">Latest test</p>
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

  <section class="section">
    <p class="kicker">02 — Effort</p>
    <ColumnChart
      title="Training minutes per day (last 4 weeks)"
      :data="minutesSeries"
      unit="min"
      :goal="DAILY_GOAL_MIN"
      :goal-label="`goal ${DAILY_GOAL_MIN} min`"
      :label-every="7"
    />
  </section>

  <section class="section">
    <p class="kicker">03 — Tests</p>
    <TrendChart
      v-if="accuracyTrend.length"
      title="Test accuracy (exact pitch)"
      :points="accuracyTrend"
      :reference="1 / 12"
      reference-label="chance"
    />
    <p v-else class="muted">No test taken yet.</p>
    <div v-if="apTests.length" class="scroll">
      <table>
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
    </div>
    <RouterLink v-if="ap.pretest" class="btn" :to="{ name: 'test', params: { kind: 'weekly' } }">
      Take a test now
    </RouterLink>
  </section>

  <section class="section">
    <p class="kicker">04 — Pitch memory</p>
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
.head {
  margin-bottom: 1.5rem;
}
.head h1 {
  margin: 0.25rem 0 0;
}
.kpis {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 1.5rem;
}
.stat {
  border-top: 1px solid var(--text);
  padding-top: 0.75rem;
}
.stat .value {
  font-family: var(--serif);
  font-size: clamp(2.6rem, 6vw, 3.6rem);
  line-height: 1;
  letter-spacing: -0.02em;
}
.stat small {
  font-family: var(--sans);
  font-size: 1rem;
  letter-spacing: 0;
  color: var(--muted);
}
.section h2 {
  margin: 0.25rem 0 0.5rem;
  font-size: 2rem;
}
.section .kicker {
  margin: 0 0 0.5rem;
}
.small {
  font-size: 0.85rem;
}
.map {
  display: grid;
  grid-template-columns: minmax(0, 380px) minmax(0, 1fr);
  gap: 2rem;
  align-items: center;
}
.extremes {
  line-height: 1.8;
}
.extremes strong {
  font-family: var(--serif);
  font-weight: 400;
  font-size: 1.5rem;
  margin: 0 0.35rem;
}
.per-pitch {
  margin-top: 1rem;
}
@media (max-width: 680px) {
  .map {
    grid-template-columns: 1fr;
    gap: 1rem;
  }
}
.band-card {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 1rem;
}
.band-card .kicker {
  margin: 0;
}
.band {
  font-family: var(--serif);
  font-size: 2.4rem;
  line-height: 1.1;
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
  height: 4px;
  background: var(--grid);
  overflow: hidden;
}
.bar span {
  display: block;
  height: 100%;
  background: var(--series);
}
@media (max-width: 680px) {
  .scroll {
    overflow-x: auto;
  }
  .scroll table {
    min-width: 30rem;
  }
}
table {
  width: 100%;
  border-collapse: collapse;
  margin: 0.75rem 0;
}
th {
  font-size: 0.8rem;
  font-variant-caps: all-small-caps;
  letter-spacing: 0.06em;
  color: var(--muted);
  font-weight: 500;
}
th,
td {
  text-align: left;
  padding: 0.4rem 0.25rem;
  border-bottom: 1px solid var(--line);
}
.num {
  font-variant-numeric: tabular-nums;
}
</style>
