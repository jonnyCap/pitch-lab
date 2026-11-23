<script setup lang="ts">
import { computed } from 'vue'
import { PITCH_CLASS_NAMES_SHARP } from '@/music/pitch'
import type { LevelSummary } from '@/ap/scoring'
import type { LevelTransition } from '@/ap/progress'

const props = defineProps<{
  summary: LevelSummary
  transition?: LevelTransition | null
}>()
defineEmits<{ continue: [] }>()

const message = computed(() => {
  switch (props.transition) {
    case 'advance':
      return 'Passed — on to the next step.'
    case 'complete':
      return 'You finished the whole ladder. Remarkable!'
    case 'fallback':
      return 'Three misses in a row without feedback — back to the feedback version for more practice.'
    case 'repeat':
      return 'Not quite 90% yet. Try this step again.'
    default:
      return null
  }
})
</script>

<template>
  <section class="card summary">
    <h2 :class="summary.passed ? 'ok' : ''">
      {{ Math.round(summary.accuracy * 100) }}%
      <small class="muted">({{ summary.correct }}/{{ summary.n }})</small>
    </h2>
    <p v-if="message">{{ message }}</p>

    <table>
      <thead>
        <tr>
          <th>Pitch</th>
          <th>Correct</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="p in summary.perPitch" :key="p.pitchClass">
          <td>{{ PITCH_CLASS_NAMES_SHARP[p.pitchClass] }}</td>
          <td>
            <span class="bar"><span :style="{ width: `${p.accuracy * 100}%` }" /></span>
            {{ p.correct }}/{{ p.n }}
          </td>
        </tr>
      </tbody>
    </table>

    <p v-if="summary.confusions.length" class="muted">
      Most confused:
      <span v-for="(c, i) in summary.confusions.slice(0, 3)" :key="i">
        {{ PITCH_CLASS_NAMES_SHARP[c.target] }} → {{ PITCH_CLASS_NAMES_SHARP[c.response] }} ({{
          c.count
        }}×){{ i < Math.min(2, summary.confusions.length - 1) ? ', ' : '' }}
      </span>
    </p>
    <p class="muted">
      <template v-if="summary.medianRtMs !== null">
        Median response time (correct answers): {{ (summary.medianRtMs / 1000).toFixed(2) }} s
      </template>
      <template v-if="summary.timeouts"> · {{ summary.timeouts }} too slow</template>
    </p>
    <button class="btn btn-primary" @click="$emit('continue')">Continue</button>
  </section>
</template>

<style scoped>
.summary h2 {
  margin: 0;
  font-size: 2rem;
}
.ok {
  color: var(--ok);
}
table {
  width: 100%;
  border-collapse: collapse;
  margin: 0.75rem 0;
}
th,
td {
  text-align: left;
  padding: 0.3rem 0.25rem;
  border-bottom: 1px solid var(--border);
}
.bar {
  display: inline-block;
  width: 8rem;
  max-width: 40vw;
  height: 0.5rem;
  border-radius: 999px;
  background: var(--border);
  overflow: hidden;
  vertical-align: middle;
  margin-right: 0.5rem;
}
.bar span {
  display: block;
  height: 100%;
  background: var(--accent);
}
</style>
