/**
 * Practice decks for the fundamentals modules. Each item is one FSRS card;
 * items are introduced in a fixed teaching order. Questions are generated
 * fresh on every review (random root / octave / harmonic vs. melodic), so
 * learners memorise the concept, not one particular example.
 */
import { type Rng } from '@/lib/random'
import {
  INTERVALS,
  INTERVAL_ORDER,
  makeEarQuestion,
  makeSightQuestion,
  type EarMode,
  type EarQuestion,
  type SightQuestion,
} from './intervals'
import { parseNote, pitchNameChroma, type Clef, type Letter } from './notes'

export type Question =
  | { kind: 'staff-letter'; clef: Clef; note: string }
  | { kind: 'name-key'; pitch: string; keyboard: readonly [number, number] }
  | { kind: 'staff-key'; clef: Clef; note: string; keyboard: readonly [number, number] }
  | { kind: 'ear-interval'; ear: EarQuestion; choices: string[] }
  | { kind: 'sight-interval'; sight: SightQuestion; choices: string[] }

/** A letter (staff-letter), MIDI number (keyboard) or interval id. */
export type Answer = string | number

export type ModuleId = 'notes' | 'intervals'

export interface DeckDef {
  id: string
  module: ModuleId
  title: string
  description: string
  /** Items in teaching order. */
  items: readonly string[]
  /** "Fluent" response time for auto-grading (ms). */
  fastMs: number
  /** Maximum new items per session. */
  newPerSession: number
  /** Introduce at least this many items regardless of accuracy (for answer choices). */
  minIntroduced: number
  /** Lesson to read before the first practice. */
  lesson: string
  makeQuestion(item: string, ctx: { rng: Rng; introduced: readonly string[] }): Question
}

const TREBLE_KEYS = [60, 84] as const // C4–C6
const BASS_KEYS = [36, 60] as const // C2–C4

/** Lines first, then spaces, then ledger lines moving outwards. */
const TREBLE_ORDER = [
  'E4',
  'G4',
  'B4',
  'D5',
  'F5',
  'F4',
  'A4',
  'C5',
  'E5',
  'D4',
  'G5',
  'C4',
  'A5',
  'B3',
  'B5',
  'A3',
  'C6',
]
const BASS_ORDER = [
  'G2',
  'B2',
  'D3',
  'F3',
  'A3',
  'A2',
  'C3',
  'E3',
  'G3',
  'B3',
  'F2',
  'C4',
  'E2',
  'D4',
  'D2',
  'E4',
  'C2',
]

/** Choices for interval questions: everything introduced so far, by size. */
function intervalChoices(introduced: readonly string[], current: string): string[] {
  const ids = new Set(introduced.map((i) => i.split(':').pop()!))
  ids.add(current)
  return INTERVALS.filter((d) => ids.has(d.id)).map((d) => d.id)
}

export const DECKS: readonly DeckDef[] = [
  {
    id: 'keyboard',
    module: 'notes',
    title: 'Keyboard',
    description: 'Find any note name on the piano keyboard.',
    items: [
      'C',
      'D',
      'E',
      'F',
      'G',
      'A',
      'B',
      'F#',
      'C#',
      'Bb',
      'Eb',
      'G#',
      'Ab',
      'Db',
      'D#',
      'Gb',
      'A#',
    ],
    fastMs: 3000,
    newPerSession: 5,
    minIntroduced: 3,
    lesson: 'keyboard',
    makeQuestion: (item) => ({ kind: 'name-key', pitch: item, keyboard: [48, 71] }),
  },
  {
    id: 'treble',
    module: 'notes',
    title: 'Treble clef',
    description: 'Name notes on the treble staff, including ledger lines.',
    items: TREBLE_ORDER,
    fastMs: 2500,
    newPerSession: 4,
    minIntroduced: 3,
    lesson: 'treble-clef',
    makeQuestion: (item) => ({ kind: 'staff-letter', clef: 'treble', note: item }),
  },
  {
    id: 'bass',
    module: 'notes',
    title: 'Bass clef',
    description: 'Name notes on the bass staff, including ledger lines.',
    items: BASS_ORDER,
    fastMs: 2500,
    newPerSession: 4,
    minIntroduced: 3,
    lesson: 'bass-clef',
    makeQuestion: (item) => ({ kind: 'staff-letter', clef: 'bass', note: item }),
  },
  {
    id: 'staff-keys',
    module: 'notes',
    title: 'Staff → keyboard',
    description: 'Play the written note on the keyboard — accidentals and enharmonics included.',
    items: [
      ...['E4', 'G4', 'B4', 'D5', 'F5', 'F4', 'A4', 'C5', 'E5'].map((n) => `treble:${n}`),
      ...['G2', 'B2', 'D3', 'F3', 'A3', 'A2', 'C3', 'E3', 'G3'].map((n) => `bass:${n}`),
      ...[
        'treble:F#4',
        'treble:Bb4',
        'treble:C#5',
        'treble:Eb5',
        'bass:F#3',
        'bass:Bb2',
        'treble:G#4',
        'treble:Ab4',
        'bass:C#3',
        'bass:Eb3',
        'treble:D#5',
        'treble:Db5',
        'bass:G#2',
        'bass:Ab2',
        // Enharmonic spellings of white keys.
        'treble:E#4',
        'treble:Cb5',
        'bass:B#2',
        'bass:Fb3',
      ],
    ],
    fastMs: 3500,
    newPerSession: 3,
    minIntroduced: 2,
    lesson: 'accidentals',
    makeQuestion: (item) => {
      const [clef, note] = item.split(':') as [Clef, string]
      return {
        kind: 'staff-key',
        clef,
        note,
        keyboard: clef === 'treble' ? TREBLE_KEYS : BASS_KEYS,
      }
    },
  },
  {
    id: 'ear-intervals',
    module: 'intervals',
    title: 'Intervals by ear',
    description: 'Hear two notes and name the distance — rising, falling, then together.',
    items: (['asc', 'desc', 'harm'] as EarMode[]).flatMap((m) =>
      INTERVAL_ORDER.map((i) => `${m}:${i}`),
    ),
    fastMs: 3500,
    newPerSession: 1,
    minIntroduced: 3,
    lesson: 'intervals-ear',
    makeQuestion: (item, { rng, introduced }) => {
      const [mode, id] = item.split(':') as [EarMode, string]
      return {
        kind: 'ear-interval',
        ear: makeEarQuestion(id, mode, rng),
        choices: intervalChoices(introduced, id),
      }
    },
  },
  {
    id: 'sight-intervals',
    module: 'intervals',
    title: 'Intervals on the staff',
    description: 'Read intervals from notation — size and quality.',
    items: INTERVAL_ORDER,
    fastMs: 4000,
    newPerSession: 2,
    minIntroduced: 3,
    lesson: 'intervals',
    makeQuestion: (item, { rng, introduced }) => ({
      kind: 'sight-interval',
      sight: makeSightQuestion(item, rng),
      choices: intervalChoices(introduced, item),
    }),
  },
]

export function deckById(id: string): DeckDef {
  const d = DECKS.find((x) => x.id === id)
  if (!d) throw new Error(`unknown deck ${id}`)
  return d
}

/** The correct answer for a question (used for feedback and e2e). */
export function correctAnswer(q: Question): Answer {
  switch (q.kind) {
    case 'staff-letter':
      return parseNote(q.note).letter
    case 'name-key':
      return pitchNameChroma(q.pitch)
    case 'staff-key':
      return parseNote(q.note).midi
    case 'ear-interval':
      return q.ear.interval
    case 'sight-interval':
      return q.sight.interval
  }
}

export function isCorrect(q: Question, a: Answer): boolean {
  switch (q.kind) {
    case 'name-key':
      // Any octave: the key's pitch class must match (enharmonics included).
      return typeof a === 'number' && ((a % 12) + 12) % 12 === pitchNameChroma(q.pitch)
    case 'staff-key':
      // Exact key, so octave placement matters; enharmonic spellings map to the same key.
      return a === parseNote(q.note).midi
    case 'staff-letter':
      return a === (parseNote(q.note).letter satisfies Letter)
    default:
      return a === correctAnswer(q)
  }
}
