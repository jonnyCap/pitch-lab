<script setup lang="ts">
import { computed, onMounted, shallowRef } from 'vue'
import { RouterLink } from 'vue-router'
import { db, type Trial, type TrainingSession } from '@/data/db'
import { PITCH_CLASS_NAMES_SHARP } from '@/music/pitch'
import { formatDuration, perPitchAccuracy, totalActiveMs, trainingDays } from '@/ap/stats'
import { useApStore } from '@/stores/ap'

const ap = useApStore()
const sessions = shallowRef<TrainingSession[]>([])
const recent = shallowRef<Trial[]>([])
const RECENT_N = 500

onMounted(async () => {
  if (!ap.loaded) await ap.load()
  sessions.value = await db.sessions.where('module').equals('ap').toArray()
  // Recent training trials (exclude tests so practice and assessment stay separate).
  const latest = await db.trials
    .where('[module+ts]')
    .between(['ap', 0], ['ap', Infinity])
    .reverse()
    .limit(RECENT_N * 2)
    .toArray()
  recent.value = latest.filter((t) => !t.levelId.startsWith('test-')).slice(0, RECENT_N)
})

const hours = computed(() => formatDuration(totalActiveMs(sessions.value)))
const days = computed(() => trainingDays(sessions.value))
const levelsPassed = computed(() => Object.values(ap.progress.passes).reduce((a, b) => a + b, 0))
const pitchAcc = computed(() => perPitchAccuracy(recent.value))

const pct = (x: number) => `${Math.round(x * 100)}%`
const date = (ts: number) => new Date(ts).toLocaleDateString()
const metric = (m: Record<string, unknown>, k: string) => m[k] as number | null
</script>

<template>
  <h1>Progress</h1>

  <div class="grid">
    <div class="card stat">
      <div class="value">{{ ap.mastered }}<small>/12</small></div>
      <div class="muted">pitches mastered</div>
    </div>
    <div class="card stat">
      <div class="value">{{ ap.currentLevel ? ap.currentLevel.tier : 12 }}</div>
      <div class="muted">
        pitches in training{{ ap.currentLevel ? ` · step ${ap.currentLevel.step}/8` : '' }}
      </div>
    </div>
    <div class="card stat">
      <div class="value">{{ hours }}</div>
      <div class="muted">training time · {{ days }} day{{ days === 1 ? '' : 's' }}</div>
    </div>
    <div class="card stat">
      <div class="value">{{ levelsPassed }}</div>
      <div class="muted">levels passed</div>
    </div>
  </div>

  <section class="card block">
    <h2>Accuracy per pitch</h2>
    <p class="muted small">Last {{ recent.length }} training notes.</p>
    <p v-if="!pitchAcc.length" class="muted">No training yet.</p>
    <ul class="bars">
      <li v-for="p in pitchAcc" :key="p.pitchClass">
        <span class="pc">{{ PITCH_CLASS_NAMES_SHARP[p.pitchClass] }}</span>
        <span class="bar"><span :style="{ width: pct(p.accuracy) }" /></span>
        <span class="muted">{{ pct(p.accuracy) }} · {{ p.n }}</span>
      </li>
    </ul>
  </section>

  <section class="card block">
    <h2>Tests</h2>
    <p v-if="!ap.tests.length" class="muted">No test taken yet.</p>
    <table v-else>
      <thead>
        <tr>
          <th>Date</th>
          <th>Test</th>
          <th>Exact</th>
          <th>Avg. error</th>
          <th>Untrained</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="t in ap.tests" :key="t.id">
          <td>{{ date(t.takenAt) }}</td>
          <td>{{ t.kind }}</td>
          <td>{{ pct(metric(t.metrics, 'accuracy') ?? 0) }}</td>
          <td>{{ (metric(t.metrics, 'mad') ?? 0).toFixed(2) }}</td>
          <td>
            {{ pct((t.metrics.untrained as { accuracy: number } | undefined)?.accuracy ?? 0) }}
          </td>
        </tr>
      </tbody>
    </table>
    <RouterLink v-if="ap.pretest" class="btn" :to="{ name: 'test', params: { kind: 'weekly' } }">
      Take a test now
    </RouterLink>
  </section>
</template>

<style scoped>
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
  background: var(--border);
  overflow: hidden;
}
.bar span {
  display: block;
  height: 100%;
  background: var(--accent);
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
</style>
