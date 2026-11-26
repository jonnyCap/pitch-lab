<script setup lang="ts">
/**
 * Level result: accuracy ring + count-up, outcome stamp, points, per-pitch
 * chroma radial and top confusions. The full table sits behind a disclosure.
 */
import { computed, onMounted, ref } from 'vue'
import { PITCH_CLASS_NAMES_SHARP, type PitchClass } from '@/music/pitch'
import { MASTERY_PASSES } from '@/ap/protocol'
import type { LevelSummary } from '@/ap/scoring'
import type { LevelTransition } from '@/ap/progress'
import { CountUp, ResultStamp, RingGauge } from '@/components/game'
import { burst } from '@/lib/fx'
import { dur } from '@/lib/motion'
import ChromaRadial from './ChromaRadial.vue'

const props = defineProps<{
  summary: LevelSummary
  transition?: LevelTransition | 'drill-done' | null
  /** Mastery passes so far (shown after a mastery-level pass). */
  masteryPasses?: number
}>()
defineEmits<{ continue: [] }>()

const label = (r: PitchClass | 'none') => (r === 'none' ? 'not in set' : PITCH_CLASS_NAMES_SHARP[r])

const message = computed(() => {
  switch (props.transition) {
    case 'advance':
      return 'Passed — on to the next step.'
    case 'mastery-pass':
      return `Mastery pass ${props.masteryPasses ?? ''} of ${MASTERY_PASSES} — well done.`
    case 'drill-done':
      return 'Focus drill done — back to your level.'
    case 'complete':
      return 'You mastered the whole ladder: all 12 pitches, fast and accurate. Remarkable!'
    case 'fallback':
      return 'Three misses in a row without feedback — back to the feedback version for more practice.'
    case 'repeat':
      return 'Not quite 90% yet. Try this step again.'
    default:
      return null
  }
})

const stamp = computed(() => {
  if (props.transition === 'complete') return { text: 'Mastered', tone: 'ok' as const }
  if (props.transition === 'drill-done') return { text: 'Drill done', tone: 'ink' as const }
  return props.summary.passed
    ? { text: 'Passed', tone: 'ok' as const }
    : { text: 'Try again', tone: 'ink' as const }
})

const pct = computed(() => Math.round(props.summary.accuracy * 100))
const confusions = computed(() => props.summary.confusions.slice(0, 3))
const gauge = ref<HTMLElement | null>(null)

onMounted(() => {
  if (!props.summary.passed) return
  window.setTimeout(() => gauge.value && burst(gauge.value), dur(700))
})
</script>

<template>
  <section class="card summary">
    <div class="hero">
      <div ref="gauge" class="gauge">
        <RingGauge
          :value="summary.accuracy"
          :size="168"
          :reference="0.9"
          :tone="summary.passed ? 'ok' : 'accent'"
          label="Accuracy"
        >
          <h2 :class="summary.passed ? 'ok' : ''">
            <CountUp :value="pct" suffix="%" />
          </h2>
          <span class="sub">{{ summary.correct }}/{{ summary.n }} correct</span>
        </RingGauge>
      </div>
      <div class="verdict">
        <ResultStamp :text="stamp.text" :tone="stamp.tone" />
        <p v-if="message" class="message">{{ message }}</p>
        <p class="points"><span>+</span><CountUp :value="summary.points" /><span> points</span></p>
        <p class="meta muted">
          <template v-if="summary.medianRtMs !== null">
            Median <span class="mono">{{ (summary.medianRtMs / 1000).toFixed(2) }} s</span>
          </template>
          <template v-if="summary.timeouts">
            <template v-if="summary.medianRtMs !== null"> · </template>
            {{ summary.timeouts }} too slow
          </template>
        </p>
      </div>
    </div>

    <figure class="fig">
      <ChromaRadial :per-pitch="summary.perPitch" />
      <figcaption class="fig-caption">Accuracy per pitch — dashed ring marks 90%.</figcaption>
    </figure>

    <p v-if="summary.distractors.n" class="distractors">
      <span class="muted">Not in set</span>
      <strong class="mono">{{ summary.distractors.correct }}/{{ summary.distractors.n }}</strong>
      <span class="muted">recognised</span>
    </p>

    <div v-if="confusions.length" class="confusions">
      <span class="muted">Most confused</span>
      <span v-for="(c, i) in confusions" :key="`c-${i}`" class="conf">
        {{ PITCH_CLASS_NAMES_SHARP[c.target] }}
        <svg viewBox="0 0 16 8" width="16" height="8" aria-label="heard as" role="img">
          <path d="M0 4h14M11 1l3 3-3 3" fill="none" stroke="currentColor" stroke-width="1" />
        </svg>
        {{ label(c.response) }}
        <small class="mono">×{{ c.count }}</small>
      </span>
    </div>

    <details class="tbl">
      <summary>Show table</summary>
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
          <tr v-if="summary.distractors.n">
            <td>Not in set</td>
            <td>
              <span class="bar"
                ><span
                  :style="{
                    width: `${(summary.distractors.correct / summary.distractors.n) * 100}%`,
                  }"
              /></span>
              {{ summary.distractors.correct }}/{{ summary.distractors.n }}
            </td>
          </tr>
        </tbody>
      </table>
    </details>

    <button class="btn btn-primary go" @click="$emit('continue')">Continue</button>
  </section>
</template>

<style scoped>
.distractors {
  display: flex;
  justify-content: center;
  align-items: baseline;
  gap: 0.5rem;
  margin: 0 0 1rem;
}
.hero {
  display: flex;
  align-items: center;
  gap: 2rem;
  flex-wrap: wrap;
  justify-content: center;
}
.summary h2 {
  margin: 0;
  font-size: 2.6rem;
  line-height: 1;
}
.sub {
  font-size: 0.75rem;
  color: var(--muted);
  margin-top: 0.2rem;
}
.ok {
  color: var(--ok);
}
.verdict {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.6rem;
  min-width: 0;
  max-width: 22rem;
}
.message {
  margin: 0;
}
.points {
  margin: 0;
  font-family: var(--display);
  font-size: 1.6rem;
  line-height: 1;
  color: var(--accent-ink);
}
.points span:not(.countup) {
  font-size: 1.1rem;
}
.meta {
  margin: 0;
  font-size: 0.9rem;
}
.mono {
  font-family: var(--mono);
}
.fig {
  margin: 1.5rem 0 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
}
.confusions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  justify-content: center;
  margin-top: 1rem;
}
.conf {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.2rem 0.7rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  font-family: var(--display);
  font-size: 1.1rem;
}
.conf small {
  font-size: 0.7rem;
  color: var(--muted);
}
.tbl {
  margin-top: 1rem;
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
  border-bottom: 1px solid var(--line);
}
.bar {
  display: inline-block;
  width: 8rem;
  max-width: 40vw;
  height: 3px;
  background: var(--line);
  overflow: hidden;
  vertical-align: middle;
  margin-right: 0.5rem;
}
.bar span {
  display: block;
  height: 100%;
  background: var(--accent);
}
.go {
  display: block;
  margin: 1.5rem auto 0;
  min-width: 10rem;
}
</style>
