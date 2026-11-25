/**
 * Spaced repetition for discrete facts (FSRS via ts-fsrs). Answers are graded
 * automatically from correctness and speed — there is no self-rating:
 *   wrong → Again · correct but slow → Hard · correct → Good · correct and fast → Easy
 * Cards are stored with plain timestamps so they serialise to IndexedDB / JSON.
 */
import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating,
  State,
  type Card,
  type Grade,
} from 'ts-fsrs'

export { Rating, State }

const scheduler = fsrs(
  generatorParameters({
    request_retention: 0.9,
    enable_fuzz: true,
    enable_short_term: true,
    learning_steps: ['1m', '10m'],
    relearning_steps: ['10m'],
  }),
)

export interface StoredCardState {
  due: number
  stability: number
  difficulty: number
  elapsed_days: number
  scheduled_days: number
  learning_steps: number
  reps: number
  lapses: number
  state: State
  last_review: number | null
}

/** One reviewable item of a deck. Mirrors the future backend `srs_cards` rows. */
export interface StoredCard {
  /** `${deck}:${item}` */
  id: string
  deck: string
  item: string
  card: StoredCardState
  introducedAt: number
  /** 1 = changed locally, not yet synced. */
  dirty: 0 | 1
}

export function cardId(deck: string, item: string): string {
  return `${deck}:${item}`
}

function toStored(c: Card): StoredCardState {
  return {
    due: c.due.getTime(),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: c.elapsed_days,
    scheduled_days: c.scheduled_days,
    learning_steps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    last_review: c.last_review ? c.last_review.getTime() : null,
  }
}

function fromStored(s: StoredCardState): Card {
  return {
    ...s,
    due: new Date(s.due),
    last_review: s.last_review === null ? undefined : new Date(s.last_review),
  }
}

export function newCard(deck: string, item: string, now: number): StoredCard {
  return {
    id: cardId(deck, item),
    deck,
    item,
    card: toStored(createEmptyCard(new Date(now))),
    introducedAt: now,
    dirty: 1,
  }
}

export function review(stored: StoredCard, grade: Grade, now: number): StoredCard {
  const next = scheduler.next(fromStored(stored.card), new Date(now), grade)
  return { ...stored, card: toStored(next.card), dirty: 1 }
}

/** Probability of recall right now (0–1); 0 for never-reviewed cards. */
export function retrievability(stored: StoredCard, now: number): number {
  if (stored.card.state === State.New) return 0
  return scheduler.get_retrievability(fromStored(stored.card), new Date(now), false) as number
}

/**
 * Automatic grade. `fastMs` is a deck-specific "fluent" response time:
 * ≤ ½·fast → Easy, ≤ fast → Good, slower → Hard; wrong → Again.
 */
export function autoGrade(correct: boolean, rtMs: number, fastMs: number): Grade {
  if (!correct) return Rating.Again
  if (rtMs <= fastMs / 2) return Rating.Easy
  if (rtMs <= fastMs) return Rating.Good
  return Rating.Hard
}

export function isLearning(stored: StoredCard): boolean {
  return stored.card.state === State.Learning || stored.card.state === State.Relearning
}
