<script setup lang="ts">
/**
 * One spaced-repetition practice session for a fundamentals deck:
 * plan (due + gated new items) → question → answer → feedback (+ sound) →
 * FSRS update → items still in short-term learning are asked again → summary.
 */
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { RouterLink } from 'vue-router'
import { db } from '@/data/db'
import { mulberry32, randomSeed } from '@/lib/random'
import { correctAnswer, deckById, isCorrect, type Answer, type Question } from '@/learn/decks'
import { intervalById } from '@/learn/intervals'
import { LETTERS, parseNote, pitchNameChroma, prettyNote, prettyPitch } from '@/learn/notes'
import { planSession, REQUEUE_WITHIN_MS, requeuePosition } from '@/learn/session'
import { autoGrade, newCard, review, type StoredCard } from '@/learn/srs'
import { loadCards, recentReviews, saveReview } from '@/learn/store'
import { playNotes, playStyled } from '@/learn/sound'
import { noteValue } from '@/learn/rhythm'
import StaffNotation from '@/components/learn/StaffNotation.vue'
import RhythmNotation from '@/components/learn/RhythmNotation.vue'
import PianoKeyboard, { type KeyHighlight } from '@/components/learn/PianoKeyboard.vue'

const props = defineProps<{ deck: string }>()
const deck = computed(() => deckById(props.deck))
const E2E = import.meta.env.MODE === 'e2e'

const rng = mulberry32(randomSeed())
const stage = ref<'loading' | 'question' | 'feedback' | 'done' | 'empty'>('loading')
const queue = ref<string[]>([])
const index = ref(0)
const question = shallowRef<Question | null>(null)
const lastAnswer = ref<Answer | null>(null)
const lastCorrect = ref(false)
const cards = new Map<string, StoredCard>()
const requeues = new Map<string, number>()
let newItems: string[] = []
let shownAt = 0
let advanceTimer: ReturnType<typeof setTimeout> | undefined

const answered = ref(0)
const correctCount = ref(0)
const nextDue = ref<number | null>(null)

onMounted(async () => {
  for (const c of await loadCards(db, deck.value.id)) cards.set(c.item, c)
  const plan = planSession(
    deck.value,
    [...cards.values()],
    await recentReviews(db, deck.value.id, 30),
    Date.now(),
  )
  newItems = plan.newItems
  queue.value = plan.items
  if (queue.value.length === 0) stage.value = 'empty'
  else void ask()
})

onBeforeUnmount(() => clearTimeout(advanceTimer))

const introduced = () => [...new Set([...cards.keys(), ...newItems])]
const item = computed(() => queue.value[index.value] ?? '')
const isNew = computed(() => !cards.has(item.value))

async function ask() {
  lastAnswer.value = null
  question.value = deck.value.makeQuestion(item.value, { rng, introduced: introduced() })
  stage.value = 'question'
  shownAt = performance.now()
  const q = question.value
  if (q.kind === 'ear-interval' || (q.kind === 'choice' && q.visual.type === 'audio')) {
    await playEar()
  }
}

async function playEar() {
  const q = question.value
  if (q?.kind === 'ear-interval') {
    const sounds = await playNotes(q.ear.midis, q.ear.mode === 'harm')
    // Response time counts from the last note's onset (the interval is complete then).
    if (stage.value === 'question') shownAt = Math.max(shownAt, sounds.at(-1)!.onsetPerfMs)
  } else if (q?.kind === 'choice' && q.visual.type === 'audio') {
    const sounds = await playStyled(q.visual.midis, q.visual.style)
    // A chord is complete at its first (block) onset; a scale after its last note.
    const ref = q.visual.style === 'chord' ? sounds[0]! : sounds[q.visual.midis.length - 1]!
    if (stage.value === 'question') shownAt = Math.max(shownAt, ref.onsetPerfMs)
  }
}

async function answer(a: Answer, timeStamp = performance.now()) {
  const q = question.value
  if (!q || stage.value !== 'question') return
  const correct = isCorrect(q, a)
  const rtMs = Math.max(0, Math.round(timeStamp - shownAt))
  const now = Date.now()
  const grade = autoGrade(correct, rtMs, deck.value.fastMs)
  const card = review(cards.get(item.value) ?? newCard(deck.value.id, item.value, now), grade, now)
  cards.set(item.value, card)
  lastAnswer.value = a
  lastCorrect.value = correct
  answered.value++
  if (correct) correctCount.value++
  stage.value = 'feedback'

  // Still in short-term learning → ask again a few questions later (max twice).
  const n = requeues.get(item.value) ?? 0
  if (card.card.due - now <= REQUEUE_WITHIN_MS && n < 2) {
    queue.value.splice(requeuePosition(index.value, queue.value.length), 0, item.value)
    requeues.set(item.value, n + 1)
  }
  void saveReview(db, card, {
    deck: deck.value.id,
    item: item.value,
    correct,
    rtMs,
    grade,
    ts: now,
  })
  void playFeedback(q)
  if (correct) advanceTimer = setTimeout(next, E2E ? 50 : 900)
}

async function playFeedback(q: Question) {
  switch (q.kind) {
    case 'staff-letter':
    case 'staff-key':
      await playNotes([parseNote(q.note).midi])
      break
    case 'name-key':
      if (typeof lastAnswer.value === 'number' && lastCorrect.value)
        await playNotes([lastAnswer.value])
      break
    case 'ear-interval':
      if (!lastCorrect.value) await playNotes(q.ear.midis, q.ear.mode === 'harm')
      break
    case 'sight-interval':
      await playNotes(
        [parseNote(q.sight.lower).midi, parseNote(q.sight.upper).midi],
        q.sight.harmonic,
      )
      break
    case 'choice': {
      const v = q.visual
      if (v.type === 'audio' && !lastCorrect.value) await playStyled(v.midis, v.style)
      else if (v.type === 'staff' && v.notes.length) {
        await playStyled(
          v.notes.map((n) => parseNote(n).midi),
          v.harmonic ? 'chord' : 'scale',
        )
      }
      break
    }
  }
}

function next() {
  clearTimeout(advanceTimer)
  if (stage.value !== 'feedback') return
  if (index.value + 1 >= queue.value.length) {
    const dues = [...cards.values()].map((c) => c.card.due)
    nextDue.value = dues.length ? Math.min(...dues) : null
    stage.value = 'done'
    return
  }
  index.value++
  void ask()
}

// --- Keyboard shortcuts -----------------------------------------------------
function onKey(e: KeyboardEvent) {
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return
  if (stage.value === 'feedback' && (e.code === 'Enter' || e.code === 'Space')) {
    e.preventDefault()
    next()
    return
  }
  const q = question.value
  if (stage.value !== 'question' || !q) return
  if (q.kind === 'staff-letter') {
    const letter = e.key.toUpperCase()
    if ((LETTERS as readonly string[]).includes(letter)) answer(letter, e.timeStamp)
  } else if (q.kind === 'ear-interval' || q.kind === 'sight-interval') {
    const i = Number(e.key) - 1
    if (i >= 0 && i < q.choices.length) answer(q.choices[i]!, e.timeStamp)
    else if (e.code === 'KeyR' && q.kind === 'ear-interval') void playEar()
  } else if (q.kind === 'choice') {
    const i = Number(e.key) - 1
    if (/^[1-9]$/.test(e.key) && i < q.choices.length) answer(q.choices[i]!.id, e.timeStamp)
    else if (e.code === 'KeyR' && q.visual.type === 'audio') void playEar()
  }
}
window.addEventListener('keydown', onKey)
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

// --- View helpers -------------------------------------------------------------
const keyHighlights = computed<KeyHighlight[]>(() => {
  const q = question.value
  if (stage.value !== 'feedback' || !q || (q.kind !== 'staff-key' && q.kind !== 'name-key'))
    return []
  const out: KeyHighlight[] = []
  if (q.kind === 'staff-key') {
    out.push({ midi: parseNote(q.note).midi, kind: 'correct' })
  } else if (lastCorrect.value && typeof lastAnswer.value === 'number') {
    out.push({ midi: lastAnswer.value, kind: 'correct' })
  } else {
    const chroma = pitchNameChroma(q.pitch)
    for (let m = q.keyboard[0]; m <= q.keyboard[1]; m++)
      if (m % 12 === chroma) out.push({ midi: m, kind: 'correct' })
  }
  if (!lastCorrect.value && typeof lastAnswer.value === 'number')
    out.push({ midi: lastAnswer.value, kind: 'wrong' })
  return out
})

const correctText = computed(() => {
  const q = question.value
  if (!q) return ''
  switch (q.kind) {
    case 'staff-letter':
    case 'staff-key':
      return prettyNote(q.note)
    case 'name-key':
      return prettyPitch(q.pitch)
    case 'ear-interval':
      return intervalById(q.ear.interval).long
    case 'sight-interval':
      return `${intervalById(q.sight.interval).long} (${prettyNote(q.sight.lower)}–${prettyNote(q.sight.upper)})`
    case 'choice': {
      const label = q.choices.find((c) => c.id === q.answer)?.label ?? q.answer
      return q.visual.type === 'staff' && q.visual.notes.length
        ? `${label} (${q.visual.notes.map((n) => prettyNote(n)).join(' ')})`
        : label
    }
  }
  return ''
})

const e2eAnswer = computed(() => {
  if (!E2E || !question.value || stage.value !== 'question') return undefined
  const q = question.value
  if (q.kind === 'name-key') {
    const chroma = correctAnswer(q) as number
    for (let m = q.keyboard[0]; m <= q.keyboard[1]; m++) if (m % 12 === chroma) return String(m)
  }
  return String(correctAnswer(q))
})

const modeLabel = { asc: 'rising', desc: 'falling', harm: 'together' } as const
const noteEvent = (code: string) => {
  const v = noteValue(code)
  return { code: v.code, beats: v.beats, rest: v.rest }
}
const pct = computed(() =>
  answered.value ? Math.round((correctCount.value / answered.value) * 100) : 0,
)
</script>

<template>
  <p class="muted crumbs"><RouterLink to="/learn">Learn</RouterLink> / {{ deck.title }}</p>
  <h1>{{ deck.title }}</h1>

  <p v-if="stage === 'loading'" class="muted">Loading…</p>

  <section v-else-if="stage === 'empty'" class="card">
    <p>Nothing to practise right now — everything is learned and scheduled for later. 🎉</p>
    <RouterLink class="btn" to="/learn">Back to Learn</RouterLink>
  </section>

  <section v-else-if="stage === 'done'" class="card summary">
    <h2>
      {{ pct }}% <small class="muted">({{ correctCount }}/{{ answered }})</small>
    </h2>
    <p v-if="newItems.length">
      New today: {{ newItems.length }} item{{ newItems.length === 1 ? '' : 's' }}.
    </p>
    <p v-if="nextDue" class="muted">
      Next review
      {{
        nextDue <= Date.now() + 60_000
          ? 'in a minute'
          : new Date(nextDue).toLocaleString([], {
              weekday: 'short',
              hour: '2-digit',
              minute: '2-digit',
            })
      }}.
    </p>
    <div class="row">
      <RouterLink class="btn btn-primary" to="/learn">Done</RouterLink>
      <button class="btn" @click="$router.go(0)">Practise more</button>
    </div>
  </section>

  <section
    v-else-if="question"
    :key="`card-${index}`"
    class="card practice"
    :data-stage="stage"
    :data-index="index"
    :data-kind="question.kind"
    :data-e2e-answer="e2eAnswer"
  >
    <div class="topline">
      <span class="muted">{{ index + 1 }} / {{ queue.length }}</span>
      <span v-if="isNew && stage === 'question'" class="new">new</span>
    </div>

    <!-- Prompt -->
    <template v-if="question.kind === 'staff-letter' || question.kind === 'staff-key'">
      <p class="prompt">
        {{
          question.kind === 'staff-letter'
            ? 'Which note is this?'
            : 'Play this note on the keyboard.'
        }}
      </p>
      <StaffNotation :clef="question.clef" :notes="[question.note]" />
    </template>
    <template v-else-if="question.kind === 'name-key'">
      <p class="prompt">Find this note on the keyboard:</p>
      <p class="big">{{ prettyPitch(question.pitch) }}</p>
    </template>
    <template v-else-if="question.kind === 'ear-interval'">
      <p class="prompt">
        Which interval? <span class="muted">({{ modeLabel[question.ear.mode] }})</span>
      </p>
      <button class="btn replay" @click="playEar">▶ Play again <kbd>R</kbd></button>
    </template>
    <template v-else-if="question.kind === 'choice'">
      <p class="prompt">{{ question.prompt }}</p>
      <StaffNotation
        v-if="question.visual.type === 'staff'"
        :clef="question.visual.clef"
        :notes="question.visual.notes"
        :harmonic="question.visual.harmonic"
        :key-signature="question.visual.keySignature"
        :width="question.visual.notes.length > 4 ? 330 : 240"
      />
      <button v-else-if="question.visual.type === 'audio'" class="btn replay" @click="playEar">
        ▶ Play again <kbd>R</kbd>
      </button>
      <RhythmNotation v-else :bars="[[noteEvent(question.visual.code)]]" :width="120" />
    </template>
    <template v-else-if="question.kind === 'sight-interval'">
      <p class="prompt">Which interval is written here?</p>
      <StaffNotation
        clef="treble"
        :notes="[question.sight.lower, question.sight.upper]"
        :harmonic="question.sight.harmonic"
      />
    </template>

    <!-- Answer input -->
    <div v-if="question.kind === 'staff-letter'" class="choices letters">
      <button
        v-for="l in LETTERS"
        :key="l"
        :data-choice="l"
        class="btn choice"
        :class="{
          correct: stage === 'feedback' && l === parseNote(question.note).letter,
          wrong: stage === 'feedback' && !lastCorrect && l === lastAnswer,
        }"
        :disabled="stage !== 'question'"
        @pointerdown.prevent="answer(l, $event.timeStamp)"
      >
        {{ l }}
      </button>
    </div>
    <PianoKeyboard
      v-else-if="question.kind === 'name-key' || question.kind === 'staff-key'"
      :lo="question.keyboard[0]"
      :hi="question.keyboard[1]"
      label-c
      :disabled="stage !== 'question'"
      :highlights="keyHighlights"
      @press="(m, ts) => answer(m, ts)"
    />
    <div v-else-if="question.kind === 'choice'" class="choices wide">
      <button
        v-for="(c, i) in question.choices"
        :key="c.id"
        :data-choice="c.id"
        class="btn choice"
        :class="{
          correct: stage === 'feedback' && c.id === question.answer,
          wrong: stage === 'feedback' && !lastCorrect && c.id === lastAnswer,
        }"
        :disabled="stage !== 'question'"
        @pointerdown.prevent="answer(c.id, $event.timeStamp)"
      >
        {{ c.label }} <kbd v-if="i < 9">{{ i + 1 }}</kbd>
      </button>
    </div>
    <div v-else class="choices">
      <button
        v-for="(c, i) in question.choices"
        :key="c"
        :data-choice="c"
        class="btn choice"
        :class="{
          correct: stage === 'feedback' && c === correctAnswer(question),
          wrong: stage === 'feedback' && !lastCorrect && c === lastAnswer,
        }"
        :disabled="stage !== 'question'"
        :title="intervalById(c).long"
        @pointerdown.prevent="answer(c, $event.timeStamp)"
      >
        {{ intervalById(c).short }} <kbd>{{ i + 1 }}</kbd>
      </button>
    </div>

    <!-- Feedback -->
    <div class="feedback" aria-live="polite">
      <template v-if="stage === 'feedback'">
        <span :class="lastCorrect ? 'ok' : 'bad'">{{
          lastCorrect ? '✓ Correct' : '✗ Not quite'
        }}</span>
        <span v-if="!lastCorrect">
          — it was <strong>{{ correctText }}</strong></span
        >
        <button v-if="!lastCorrect" class="btn btn-primary" @click="next">
          Continue <kbd>↵</kbd>
        </button>
      </template>
    </div>
  </section>
</template>

<style scoped>
.crumbs {
  margin: 0;
  font-size: 0.9rem;
}
.practice {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
/* Each new card is dealt in with a slight 3D tilt. */
.practice {
  transform-origin: 50% 100%;
  animation: deal 0.38s var(--ease-out);
}
@keyframes deal {
  from {
    opacity: 0;
    transform: perspective(900px) rotateX(10deg) translateY(10px);
  }
}
.topline {
  display: flex;
  justify-content: space-between;
}
.new {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--accent-ink);
}
.prompt {
  margin: 0;
  font-weight: 600;
  text-align: center;
}
.big {
  font-size: 3rem;
  font-weight: 800;
  text-align: center;
  margin: 0.5rem 0;
}
.replay {
  align-self: center;
}
.choices {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.5rem;
}
.choice {
  min-width: 3.5rem;
  touch-action: manipulation;
}
.wide .choice {
  min-width: 9rem;
}
.letters .choice {
  min-width: 2.8rem;
}
.choice.correct {
  background: var(--ok);
  border-color: var(--ok);
  color: var(--on-status);
}
.choice.wrong {
  background: var(--bad);
  border-color: var(--bad);
  color: var(--on-status);
}
kbd {
  font-size: 0.65rem;
  opacity: 0.55;
}
.feedback {
  min-height: 2.5rem;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}
.ok {
  color: var(--ok);
  font-weight: 700;
}
.bad {
  color: var(--bad);
  font-weight: 700;
}
.summary h2 {
  margin: 0;
  font-size: 2rem;
}
.row {
  display: flex;
  gap: 0.75rem;
}
@media (hover: none) {
  kbd {
    display: none;
  }
}
</style>
