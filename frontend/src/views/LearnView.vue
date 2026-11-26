<script setup lang="ts">
import { computed, onMounted, shallowRef } from 'vue'
import { RouterLink } from 'vue-router'
import { db } from '@/data/db'
import { DECKS, type DeckDef, type ModuleId } from '@/learn/decks'
import { deckStats, type DeckStats } from '@/learn/store'
import { ALL_LESSONS } from '@/content/lessons'
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
  {
    id: 'harmony',
    title: 'Scales, keys & chords',
    text: 'Major, minor and modal scales, key signatures, triads, seventh chords and inversions.',
  },
  {
    id: 'rhythm',
    title: 'Rhythm',
    text: 'Note values, time signatures and reading rhythms by tapping.',
  },
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

const hero = computed(() => {
  const st = stats.value
  if (!DECKS.every((d) => st[d.id])) return null
  const byDue = [...DECKS].sort((a, b) => st[b.id]!.due - st[a.id]!.due)[0]!
  if (st[byDue.id]!.due > 0) return { deck: byDue, why: `${st[byDue.id]!.due} due now` }
  const fresh = DECKS.find((d) => st[d.id]!.introduced === 0)
  if (fresh) return { deck: fresh, why: 'Not started yet' }
  return { deck: DECKS[0]!, why: 'All caught up' }
})
const pctOf = (id: string) => {
  const s = stats.value[id]
  return s && s.total ? (s.introduced / s.total) * 100 : 0
}

const decksOf = (m: ModuleId): DeckDef[] => DECKS.filter((d) => d.module === m)
const lessonsOf = (m: ModuleId) => ALL_LESSONS.filter((l) => l.module === m)
</script>

<template>
  <header class="masthead">
    <p class="kicker">Fundamentals</p>
    <h1>Learn</h1>
    <p class="dek">Short lessons, then practice timed to just before you would forget.</p>
  </header>

  <section v-if="hero" class="hero">
    <div>
      <p class="kicker">Continue where you left off</p>
      <h2 class="hero-title">{{ hero.deck.title }}</h2>
      <p class="muted">{{ hero.why }}</p>
    </div>
    <RouterLink class="btn btn-primary" :to="{ name: 'practice', params: { deck: hero.deck.id } }">
      {{ stats[hero.deck.id]?.introduced ? 'Practise' : 'Start' }}
    </RouterLink>
  </section>

  <section v-for="(m, mi) in MODULES" :key="m.id" class="module section">
    <p class="kicker">{{ String(mi + 1).padStart(2, '0') }}</p>
    <h2>{{ m.title }}</h2>
    <p class="dek">{{ m.text }}</p>
    <p v-if="m.id === 'intervals' && ap.progress.onboardingDone && apToday < 1" class="tip">
      Training absolute pitch today? Do that session first.
    </p>

    <ol class="lessons">
      <li v-for="(l, li) in lessonsOf(m.id)" :key="l.id">
        <RouterLink class="lesson-link" :to="{ name: 'lesson', params: { id: l.id } }">
          <span class="num">{{ String(li + 1).padStart(2, '0') }}</span>
          <span class="ltitle">{{ l.title }}</span>
          <svg viewBox="0 0 16 16" width="14" height="14" class="arrow" aria-hidden="true">
            <path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.2" />
          </svg>
        </RouterLink>
      </li>
    </ol>

    <div class="grid">
      <article v-for="d in decksOf(m.id)" :key="d.id" class="card deck" :data-deck="d.id">
        <div class="deck-top">
          <h3>{{ d.title }}</h3>
          <span v-if="stats[d.id]?.due" class="due">{{ stats[d.id]!.due }} due</span>
        </div>
        <p class="muted desc">{{ d.description }}</p>
        <div class="mastery">
          <span class="bar" aria-hidden="true"><i :style="{ width: pctOf(d.id) + '%' }" /></span>
          <span v-if="stats[d.id]" class="meta">
            {{ stats[d.id]!.introduced }}/{{ stats[d.id]!.total }} learned
          </span>
        </div>
        <RouterLink class="btn btn-primary" :to="{ name: 'practice', params: { deck: d.id } }">
          {{ stats[d.id]?.introduced ? 'Practise' : 'Start' }}
        </RouterLink>
      </article>
      <article v-if="m.id === 'rhythm'" class="card deck" data-deck="rhythm-tap">
        <div class="deck-top">
          <h3>Rhythm reading</h3>
        </div>
        <p class="muted desc">Read a rhythm and tap it along with a metronome.</p>
        <div class="mastery" />
        <RouterLink class="btn btn-primary" :to="{ name: 'rhythm' }">Open</RouterLink>
      </article>
    </div>
  </section>
</template>

<style scoped>
.masthead h1 {
  font-size: clamp(2.1rem, 4.5vw, 2.9rem);
  margin: 0;
}
.dek {
  font-family: var(--display);
  font-size: 1.15rem;
  line-height: 1.3;
  color: var(--muted);
  margin: 0.5rem 0 2rem;
  max-width: 46rem;
}
.hero {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-top: 2rem;
  padding: 2rem 2.25rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-left: 3px solid var(--accent);
  border-radius: var(--radius);
  animation: rise 0.4s var(--ease-out);
}
@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
}
.hero p {
  margin: 0;
}
.hero-title {
  margin: 0.15rem 0;
  font-size: 1.4rem;
}
.module h2 {
  margin: 0 0 0.4rem;
  font-size: clamp(1.5rem, 3.2vw, 1.9rem);
}
.module .kicker {
  margin: 0 0 0.25rem;
  font-family: var(--mono);
}
.lessons {
  list-style: none;
  padding: 0;
  margin: 1.25rem 0 2.25rem;
  border-top: 1px solid var(--line);
}
.lessons li {
  border-bottom: 1px solid var(--line);
}
.lesson-link {
  display: flex;
  align-items: baseline;
  gap: 1rem;
  padding: 0.9rem 0;
  color: var(--text);
  text-decoration: none;
}
.lesson-link .num {
  font-family: var(--mono);
  font-size: 0.8rem;
  color: var(--muted);
}
.ltitle {
  flex: 1;
  font-family: var(--display);
  font-size: 1.1rem;
  line-height: 1.2;
}
.arrow {
  align-self: center;
  opacity: 0;
  transform: translateX(-4px);
  transition:
    opacity 0.2s,
    transform 0.2s var(--ease-out);
}
.lesson-link:hover {
  color: var(--accent-ink);
}
.lesson-link:hover .arrow,
.lesson-link:focus-visible .arrow {
  opacity: 1;
  transform: none;
}
.deck {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  padding: 1.75rem;
  transition:
    transform 0.2s var(--ease-out),
    border-color 0.2s;
}
.deck:hover {
  transform: translateY(-2px);
  border-color: var(--text);
}
.deck-top {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.5rem;
}
.deck h3 {
  margin: 0;
  font-family: var(--display);
  font-weight: 600;
  font-size: 1.2rem;
}
.desc {
  margin: 0;
  font-size: 0.95rem;
  flex: 1;
  line-height: 1.55;
}
.due {
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.1rem 0.5rem;
  border-radius: 99px;
  background: var(--accent-soft);
  color: var(--accent-ink);
  white-space: nowrap;
}
.mastery {
  min-height: 1.6rem;
}
.bar {
  display: block;
  height: 3px;
  background: var(--line);
  border-radius: 2px;
  overflow: hidden;
}
.bar i {
  display: block;
  height: 100%;
  background: var(--accent);
  transition: width 0.6s var(--ease-out);
}
.meta {
  display: block;
  margin-top: 0.3rem;
  font-size: 0.85rem;
  color: var(--muted);
}
.deck .btn {
  align-self: flex-start;
}
.tip {
  border-left: 2px solid var(--accent);
  padding: 0.25rem 0 0.25rem 1rem;
  font-family: var(--display);
  font-size: 1.2rem;
  line-height: 1.3;
  margin: 0.5rem 0;
}
</style>
