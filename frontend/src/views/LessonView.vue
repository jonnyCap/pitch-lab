<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { lessonById } from '@/content/lessons'
import { playNotes } from '@/learn/sound'
import RichText from '@/components/learn/RichText.vue'
import StaffNotation from '@/components/learn/StaffNotation.vue'
import PianoKeyboard from '@/components/learn/PianoKeyboard.vue'
import CircleOfFifths from '@/components/learn/CircleOfFifths.vue'
import IntervalCircle from '@/components/viz/IntervalCircle.vue'
import ScaleStairs from '@/components/viz/ScaleStairs.vue'
import ChordStack from '@/components/viz/ChordStack.vue'
import RhythmNotation from '@/components/learn/RhythmNotation.vue'
import { parseNote } from '@/learn/notes'
import { noteOnsets, noteValue, type RhythmEvent } from '@/learn/rhythm'
import { audio } from '@/audio/engine'

const props = defineProps<{ id: string }>()
const lesson = computed(() => lessonById(props.id))

const MODULES: Record<string, string> = {
  notes: 'Notes & staff',
  intervals: 'Intervals',
  harmony: 'Scales, keys & chords',
  rhythm: 'Rhythm',
}
const FIGURES = new Set(['staff', 'circle', 'rhythm', 'keyboard', 'viz'])
/** Figure number for each block (0 = not a figure), counted in reading order. */
const figNo = computed(() => {
  let n = 0
  return (lesson.value?.blocks ?? []).map((b) => (FIGURES.has(b.type) ? ++n : 0))
})
/** "Sections" number the h2 blocks; paragraphs before the first one are the lead. */
const secNo = computed(() => {
  let n = 0
  return (lesson.value?.blocks ?? []).map((b) => (b.type === 'h' ? ++n : 0))
})
const firstPara = computed(() => (lesson.value?.blocks ?? []).findIndex((b) => b.type === 'p'))
const fig = (i: number, caption?: string) =>
  caption ? `Fig. ${figNo.value[i]} — ${caption}` : `Fig. ${figNo.value[i]}`

function pressKey(midi: number) {
  void playNotes([midi])
}

function playStaff(notes: readonly string[], harmonic?: boolean) {
  const midis = notes.map((n) => parseNote(n).midi)
  void playNotes(midis, harmonic)
}

function events(bars: string[][]): RhythmEvent[][] {
  return bars.map((b) =>
    b.map((id) => {
      const v = noteValue(id)
      return { code: v.code, beats: v.beats, rest: v.rest }
    }),
  )
}

/** Plays a rhythm at 80 bpm: a one-bar count-in, then the pattern as clicks. */
function playRhythm(bars: string[][]) {
  const beat = 60 / 80
  const countIn = [0, 1, 2, 3].map((b) => ({
    at: b * beat,
    freq: b === 0 ? 2000 : 1500,
    gain: 0.25,
  }))
  const notes = noteOnsets(events(bars)).map((t) => ({ at: (4 + t) * beat, freq: 900, gain: 0.6 }))
  void audio.playClicks([...countIn, ...notes])
}
</script>

<template>
  <template v-if="lesson">
    <article class="lesson">
      <header class="head">
        <p class="kicker crumbs">
          <RouterLink to="/learn">Learn</RouterLink> · {{ MODULES[lesson.module] }}
        </p>
        <h1>{{ lesson.title }}</h1>
        <p class="dek">{{ lesson.summary }}</p>
      </header>
      <template v-for="(b, i) in lesson.blocks" :key="`b-${i}`">
        <h2 v-if="b.type === 'h'" class="sec">
          <span class="num">{{ String(secNo[i]).padStart(2, '0') }}</span> {{ b.text }}
        </h2>
        <p v-else-if="b.type === 'p'" :class="{ lead: i === firstPara }">
          <RichText :text="b.text" />
        </p>
        <ul v-else-if="b.type === 'list'">
          <li v-for="(it, j) in b.items" :key="`li-${j}`"><RichText :text="it" /></li>
        </ul>
        <figure v-else-if="b.type === 'staff'">
          <StaffNotation
            :clef="b.clef"
            :notes="b.notes"
            :harmonic="b.harmonic"
            :key-signature="b.keySignature"
            :width="b.notes.length > 4 ? 340 : 260"
          />
          <figcaption class="fig-caption">
            {{ fig(i, b.caption) }}
            <button v-if="b.play" class="btn small" @click="playStaff(b.notes, b.harmonic)">
              ▶
            </button>
          </figcaption>
        </figure>
        <figure v-else-if="b.type === 'circle'">
          <CircleOfFifths />
          <figcaption class="fig-caption">
            {{ fig(i, 'The circle of fifths. Tap a key to turn the circle and hear its scale.') }}
          </figcaption>
        </figure>
        <figure v-else-if="b.type === 'rhythm'">
          <RhythmNotation :bars="events(b.bars)" time-signature="4/4" />
          <figcaption class="fig-caption">
            {{ fig(i, b.caption) }}
            <button class="btn small" @click="playRhythm(b.bars)">▶ Listen</button>
          </figcaption>
        </figure>
        <figure v-else-if="b.type === 'keyboard'">
          <PianoKeyboard
            :lo="b.lo"
            :hi="b.hi"
            label-c
            :highlights="(b.mark ?? []).map((m) => ({ midi: m, kind: 'mark' as const }))"
            @press="pressKey"
          />
          <figcaption class="fig-caption">{{ fig(i, b.caption) }} Tap a key to hear it.</figcaption>
        </figure>
        <template v-else-if="b.type === 'viz'">
          <IntervalCircle
            v-if="b.viz === 'interval'"
            :lower="b.lower"
            :upper="b.upper"
            :caption="fig(i, b.caption)"
          />
          <ScaleStairs
            v-else-if="b.viz === 'scale'"
            :tonic="b.tonic"
            :pattern="b.pattern"
            :name="b.name"
            :caption="fig(i, b.caption)"
          />
          <ChordStack
            v-else
            :root="b.root"
            :quality="b.quality"
            :inversion="b.inversion"
            :caption="fig(i, b.caption)"
          />
        </template>
        <p v-else-if="b.type === 'play'">
          <button class="btn" @click="playNotes(b.midis, b.harmonic)">▶ {{ b.label }}</button>
        </p>
        <blockquote v-else-if="b.type === 'tip'" class="tip">
          <RichText :text="b.text" />
        </blockquote>
        <table v-else-if="b.type === 'table'">
          <thead>
            <tr>
              <th v-for="h in b.head" :key="h">{{ h }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(r, j) in b.rows" :key="`r-${j}`">
              <td v-for="(c, k) in r" :key="`c-${k}`">{{ c }}</td>
            </tr>
          </tbody>
        </table>
      </template>
      <RouterLink class="btn btn-primary" :to="{ name: 'practice', params: { deck: lesson.deck } }">
        Practise now
      </RouterLink>
    </article>
  </template>
  <p v-else>Lesson not found. <RouterLink to="/learn">Back to Learn</RouterLink></p>
</template>

<style scoped>
.lesson {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  line-height: 1.7;
  max-width: 42rem;
  margin: 0 auto;
}
.head {
  border-bottom: 1px solid var(--text);
  padding-bottom: 1.25rem;
  margin-bottom: 0.75rem;
}
.crumbs {
  margin: 0 0 0.75rem;
}
.crumbs a {
  color: inherit;
}
h1 {
  font-family: var(--serif);
  font-weight: 400;
  font-size: clamp(2.4rem, 7vw, 3.8rem);
  line-height: 1.02;
  letter-spacing: -0.02em;
  margin: 0;
}
.dek {
  font-family: var(--serif);
  font-style: italic;
  font-size: 1.35rem;
  line-height: 1.3;
  color: var(--muted);
  margin: 0.75rem 0 0;
}
.lead {
  font-size: 1.15rem;
}
.sec {
  font-family: var(--serif);
  font-weight: 400;
  font-size: 1.8rem;
  border-top: 1px solid var(--line);
  padding-top: 1rem;
  margin: 1.5rem 0 0;
}
.sec .num {
  font-family: var(--sans);
  font-size: 0.8rem;
  color: var(--accent-ink);
  margin-right: 0.5rem;
  vertical-align: middle;
}
p,
ul {
  margin: 0;
}
figure {
  margin: 1rem 0;
  text-align: center;
}
figcaption {
  margin-top: 0.4rem;
}
.btn.small {
  padding: 0.15rem 0.6rem;
  margin-left: 0.4rem;
}
.tip {
  margin: 1.25rem 0;
  border-left: 2px solid var(--accent);
  padding: 0.25rem 0 0.25rem 1.25rem;
  font-family: var(--serif);
  font-size: 1.5rem;
  line-height: 1.25;
  letter-spacing: -0.005em;
}
.tip :deep(strong) {
  font-weight: 400;
  font-style: italic;
  color: var(--accent-ink);
}
table {
  border-collapse: collapse;
  margin: 0.75rem 0;
  width: 100%;
  font-size: 0.95rem;
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
  padding: 0.4rem 0.75rem 0.4rem 0;
  border-bottom: 1px solid var(--line);
}
.btn-primary {
  align-self: flex-start;
  margin-top: 1.5rem;
}
</style>
