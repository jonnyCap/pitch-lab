<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { lessonById } from '@/content/lessons'
import { playNotes } from '@/learn/sound'
import RichText from '@/components/learn/RichText.vue'
import StaffNotation from '@/components/learn/StaffNotation.vue'
import PianoKeyboard from '@/components/learn/PianoKeyboard.vue'
import CircleOfFifths from '@/components/learn/CircleOfFifths.vue'
import RhythmNotation from '@/components/learn/RhythmNotation.vue'
import { parseNote } from '@/learn/notes'
import { noteOnsets, noteValue, type RhythmEvent } from '@/learn/rhythm'
import { audio } from '@/audio/engine'

const props = defineProps<{ id: string }>()
const lesson = computed(() => lessonById(props.id))

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
    <p class="muted crumbs"><RouterLink to="/learn">Learn</RouterLink> / {{ lesson.title }}</p>
    <h1>{{ lesson.title }}</h1>
    <article class="card lesson">
      <template v-for="(b, i) in lesson.blocks" :key="i">
        <h2 v-if="b.type === 'h'">{{ b.text }}</h2>
        <p v-else-if="b.type === 'p'"><RichText :text="b.text" /></p>
        <ul v-else-if="b.type === 'list'">
          <li v-for="(it, j) in b.items" :key="j"><RichText :text="it" /></li>
        </ul>
        <figure v-else-if="b.type === 'staff'">
          <StaffNotation
            :clef="b.clef"
            :notes="b.notes"
            :harmonic="b.harmonic"
            :key-signature="b.keySignature"
            :width="b.notes.length > 4 ? 340 : 260"
          />
          <figcaption v-if="b.caption" class="muted">
            {{ b.caption }}
            <button v-if="b.play" class="btn small" @click="playStaff(b.notes, b.harmonic)">
              ▶
            </button>
          </figcaption>
        </figure>
        <CircleOfFifths v-else-if="b.type === 'circle'" />
        <figure v-else-if="b.type === 'rhythm'">
          <RhythmNotation :bars="events(b.bars)" time-signature="4/4" />
          <figcaption class="muted">
            {{ b.caption }}
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
          <figcaption v-if="b.caption" class="muted">
            {{ b.caption }} Tap a key to hear it.
          </figcaption>
        </figure>
        <p v-else-if="b.type === 'play'">
          <button class="btn" @click="playNotes(b.midis, b.harmonic)">▶ {{ b.label }}</button>
        </p>
        <p v-else-if="b.type === 'tip'" class="tip"><RichText :text="b.text" /></p>
        <table v-else-if="b.type === 'table'">
          <thead>
            <tr>
              <th v-for="h in b.head" :key="h">{{ h }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(r, j) in b.rows" :key="j">
              <td v-for="(c, k) in r" :key="k">{{ c }}</td>
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
.crumbs {
  margin: 0;
  font-size: 0.9rem;
}
.lesson {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  line-height: 1.6;
}
figure {
  margin: 0.5rem 0;
}
figcaption {
  text-align: center;
  font-size: 0.85rem;
}
.btn.small {
  padding: 0.15rem 0.6rem;
  margin-left: 0.4rem;
}
.tip {
  border-left: 3px solid var(--series);
  padding: 0.25rem 0.75rem;
  background: var(--bg);
  border-radius: 0 8px 8px 0;
}
table {
  border-collapse: collapse;
  margin: 0.5rem 0;
}
th,
td {
  text-align: left;
  padding: 0.3rem 0.75rem 0.3rem 0;
  border-bottom: 1px solid var(--border);
}
.btn-primary {
  align-self: flex-start;
  margin-top: 1rem;
}
</style>
