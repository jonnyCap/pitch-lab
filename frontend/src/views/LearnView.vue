<script setup lang="ts">
import { onMounted, shallowRef } from 'vue'
import { RouterLink } from 'vue-router'
import { db } from '@/data/db'
import { DECKS, type DeckDef, type ModuleId } from '@/learn/decks'
import { deckStats, type DeckStats } from '@/learn/store'
import { LESSONS } from '@/content/lessons'
import { minutesOn } from '@/ap/engagement'
import { useApStore } from '@/stores/ap'

const ap = useApStore()
const stats = shallowRef<Record<string, DeckStats>>({})
const apToday = shallowRef(0)

const MODULES: { id: ModuleId; title: string; text: string }[] = [
  {
    id: 'notes',
    title: 'Notes & staff',
    text: 'Note names, the keyboard, treble and bass clef, accidentals.',
  },
  { id: 'intervals', title: 'Intervals', text: 'Hear and read the distance between two notes.' },
]

onMounted(async () => {
  const now = Date.now()
  const entries = await Promise.all(
    DECKS.map(async (d) => [d.id, await deckStats(db, d.id, d.items.length, now)] as const),
  )
  stats.value = Object.fromEntries(entries)
  if (!ap.loaded) await ap.load()
  apToday.value = minutesOn(ap.sessions, now)
})

const decksOf = (m: ModuleId): DeckDef[] => DECKS.filter((d) => d.module === m)
const lessonsOf = (m: ModuleId) => LESSONS.filter((l) => l.module === m)
</script>

<template>
  <h1>Learn</h1>
  <p class="muted">
    Short lessons, then practice that schedules each item just before you would forget it (spaced
    repetition).
  </p>

  <section v-for="m in MODULES" :key="m.id" class="module">
    <h2>{{ m.title }}</h2>
    <p class="muted">{{ m.text }}</p>
    <p v-if="m.id === 'intervals' && ap.progress.onboardingDone && apToday < 1" class="tip">
      Training absolute pitch today? Do that session first — interval practice uses relative pitch.
    </p>

    <div class="lessons">
      <RouterLink
        v-for="l in lessonsOf(m.id)"
        :key="l.id"
        class="lesson-link"
        :to="{ name: 'lesson', params: { id: l.id } }"
      >
        📖 {{ l.title }}
      </RouterLink>
    </div>

    <div class="grid">
      <article v-for="d in decksOf(m.id)" :key="d.id" class="card deck" :data-deck="d.id">
        <h3>{{ d.title }}</h3>
        <p class="muted">{{ d.description }}</p>
        <p class="meta">
          <template v-if="stats[d.id]">
            <span>{{ stats[d.id]!.introduced }}/{{ stats[d.id]!.total }} learned</span>
            <span v-if="stats[d.id]!.due" class="due">{{ stats[d.id]!.due }} due</span>
          </template>
        </p>
        <progress v-if="stats[d.id]" :value="stats[d.id]!.introduced" :max="stats[d.id]!.total" />
        <RouterLink class="btn btn-primary" :to="{ name: 'practice', params: { deck: d.id } }">
          {{ stats[d.id]?.introduced ? 'Practise' : 'Start' }}
        </RouterLink>
      </article>
    </div>
  </section>
</template>

<style scoped>
.module {
  margin-top: 1.5rem;
}
.module h2 {
  margin-bottom: 0;
}
.lessons {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1rem;
  margin: 0.5rem 0 1rem;
}
.lesson-link {
  color: var(--accent);
  text-decoration: none;
  font-weight: 600;
}
.deck {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.deck h3 {
  margin: 0;
}
.deck p {
  margin: 0;
}
.meta {
  display: flex;
  gap: 0.75rem;
  font-size: 0.9rem;
}
.due {
  font-weight: 700;
  color: var(--accent);
}
progress {
  width: 100%;
  height: 5px;
  accent-color: var(--series);
}
.deck .btn {
  align-self: flex-start;
  margin-top: 0.25rem;
}
.tip {
  border-left: 3px solid var(--series);
  padding: 0.25rem 0.75rem;
  background: var(--surface);
  border-radius: 0 8px 8px 0;
}
</style>
