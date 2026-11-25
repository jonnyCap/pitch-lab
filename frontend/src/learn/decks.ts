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
import { parseNote, pitchNameChroma, prettyPitch, type Clef, type Letter } from './notes'
import {
  CHORD_ORDER,
  CHORDS,
  chordById,
  earMidis,
  INVERSION_LABELS,
  keyInfo,
  MAJOR_KEYS,
  makeChordNotes,
  makeScaleNotes,
  SCALE_ORDER_EAR,
  SCALE_ORDER_SIGHT,
  SCALES,
  scaleById,
} from './harmony'
import { NOTE_VALUE_ORDER, NOTE_VALUES, noteValue } from './rhythm'

/** What a multiple-choice question shows (or plays). */
export type Visual =
  | { type: 'staff'; clef: Clef; notes: string[]; harmonic?: boolean; keySignature?: string }
  | { type: 'audio'; midis: number[]; style: 'scale' | 'chord' }
  | { type: 'note-value'; code: string }

export interface Choice {
  id: string
  label: string
}

export type Question =
  | { kind: 'staff-letter'; clef: Clef; note: string }
  | { kind: 'name-key'; pitch: string; keyboard: readonly [number, number] }
  | { kind: 'staff-key'; clef: Clef; note: string; keyboard: readonly [number, number] }
  | { kind: 'ear-interval'; ear: EarQuestion; choices: string[] }
  | { kind: 'sight-interval'; sight: SightQuestion; choices: string[] }
  | { kind: 'choice'; prompt: string; visual: Visual; answer: string; choices: Choice[] }

/** A letter (staff-letter), MIDI number (keyboard) or interval id. */
export type Answer = string | number

export type ModuleId = 'notes' | 'intervals' | 'harmony' | 'rhythm'

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

/** Introduced ids (part after the last ':') plus the current one, in catalogue order. */
function introducedChoices(
  catalogue: readonly { id: string; label: string }[],
  introduced: readonly string[],
  current: string,
  prefix?: string,
): Choice[] {
  const ids = new Set(
    introduced.filter((i) => !prefix || i.startsWith(prefix)).map((i) => i.split(':').pop()!),
  )
  ids.add(current)
  return catalogue.filter((c) => ids.has(c.id))
}

const MAJOR_CHOICES = MAJOR_KEYS.map((k) => ({ id: k, label: `${prettyPitch(k)} major` }))
const MINOR_CHOICES = MAJOR_KEYS.map((k) => {
  const m = keyInfo(k).minor
  return { id: m, label: `${prettyPitch(m)} minor` }
})
const SCALE_CHOICES = SCALES.map((s) => ({ id: s.id, label: s.label }))
const CHORD_CHOICES = CHORDS.map((c) => ({ id: c.id, label: c.label }))
const VALUE_CHOICES = NOTE_VALUES.map((v) => ({ id: v.id, label: v.label }))

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
  {
    id: 'key-signatures',
    module: 'harmony',
    title: 'Key signatures',
    description: 'Name the major — later also the minor — key of a key signature.',
    items: [
      ...MAJOR_KEYS.map((k) => `maj:${k}`),
      ...MAJOR_KEYS.map((k) => `min:${keyInfo(k).minor}`),
    ],
    fastMs: 4000,
    newPerSession: 2,
    minIntroduced: 3,
    lesson: 'key-signatures',
    makeQuestion: (item, { rng, introduced }) => {
      const [mode, key] = item.split(':') as ['maj' | 'min', string]
      const major = mode === 'maj' ? key : MAJOR_KEYS.find((k) => keyInfo(k).minor === key)!
      return {
        kind: 'choice',
        prompt:
          mode === 'maj'
            ? 'Which major key has this signature?'
            : 'Which minor key has this signature?',
        visual: {
          type: 'staff',
          clef: rng() < 0.7 ? 'treble' : 'bass',
          notes: [],
          keySignature: major,
        },
        answer: key,
        choices: introducedChoices(
          mode === 'maj' ? MAJOR_CHOICES : MINOR_CHOICES,
          introduced,
          key,
          `${mode}:`,
        ),
      }
    },
  },
  {
    id: 'scales-sight',
    module: 'harmony',
    title: 'Scales on the staff',
    description: 'Recognise major, minor and modal scales from notation.',
    items: SCALE_ORDER_SIGHT,
    fastMs: 6000,
    newPerSession: 2,
    minIntroduced: 2,
    lesson: 'scales',
    makeQuestion: (item, { rng, introduced }) => ({
      kind: 'choice',
      prompt: 'Which scale is this?',
      visual: { type: 'staff', clef: 'treble', notes: makeScaleNotes(item, rng) },
      answer: item,
      choices: introducedChoices(SCALE_CHOICES, introduced, item),
    }),
  },
  {
    id: 'scales-ear',
    module: 'harmony',
    title: 'Scales by ear',
    description: 'Hear a scale and tell major, the minors and the modes apart.',
    items: SCALE_ORDER_EAR,
    fastMs: 5000,
    newPerSession: 1,
    minIntroduced: 2,
    lesson: 'modes',
    makeQuestion: (item, { rng, introduced }) => ({
      kind: 'choice',
      prompt: 'Which scale did you hear?',
      visual: {
        type: 'audio',
        midis: earMidis([...scaleById(item).semitones, 12], rng),
        style: 'scale',
      },
      answer: item,
      choices: introducedChoices(SCALE_CHOICES, introduced, item),
    }),
  },
  {
    id: 'chords-sight',
    module: 'harmony',
    title: 'Chords on the staff',
    description: 'Name triads and seventh chords in root position.',
    items: CHORD_ORDER,
    fastMs: 5000,
    newPerSession: 2,
    minIntroduced: 2,
    lesson: 'triads',
    makeQuestion: (item, { rng, introduced }) => ({
      kind: 'choice',
      prompt: 'Which chord is this?',
      visual: {
        type: 'staff',
        clef: 'treble',
        notes: makeChordNotes(item, 0, rng),
        harmonic: true,
      },
      answer: item,
      choices: introducedChoices(CHORD_CHOICES, introduced, item),
    }),
  },
  {
    id: 'inversions',
    module: 'harmony',
    title: 'Inversions',
    description: 'Which chord tone is in the bass? Root position, 1st, 2nd or 3rd inversion.',
    items: [
      ...['major', 'minor'].flatMap((c) => [0, 1, 2].map((i) => `${c}:${i}`)),
      ...['dim', 'aug'].flatMap((c) => [0, 1, 2].map((i) => `${c}:${i}`)),
      ...['dom7'].flatMap((c) => [0, 1, 2, 3].map((i) => `${c}:${i}`)),
    ],
    fastMs: 5000,
    newPerSession: 3,
    minIntroduced: 3,
    lesson: 'sevenths-inversions',
    makeQuestion: (item, { rng }) => {
      const [id, inv] = item.split(':') as [string, string]
      const n = Number(inv)
      const choices = INVERSION_LABELS.slice(0, chordById(id).seventh ? 4 : 3).map((label, i) => ({
        id: String(i),
        label,
      }))
      return {
        kind: 'choice',
        prompt: `This ${chordById(id).label} is in…`,
        visual: {
          type: 'staff',
          clef: 'treble',
          notes: makeChordNotes(id, n, rng),
          harmonic: true,
        },
        answer: String(n),
        choices,
      }
    },
  },
  {
    id: 'chords-ear',
    module: 'harmony',
    title: 'Chords by ear',
    description: 'Hear a chord (then its notes one by one) and name its quality.',
    items: CHORD_ORDER,
    fastMs: 4000,
    newPerSession: 1,
    minIntroduced: 2,
    lesson: 'hearing-chords',
    makeQuestion: (item, { rng, introduced }) => ({
      kind: 'choice',
      prompt: 'Which chord did you hear?',
      visual: {
        type: 'audio',
        midis: earMidis(chordById(item).semitones, rng, 48, 79),
        style: 'chord',
      },
      answer: item,
      choices: introducedChoices(CHORD_CHOICES, introduced, item),
    }),
  },
  {
    id: 'note-values',
    module: 'rhythm',
    title: 'Note values',
    description: 'Notes and rests and how many beats they last.',
    items: NOTE_VALUE_ORDER,
    fastMs: 3000,
    newPerSession: 3,
    minIntroduced: 3,
    lesson: 'note-values',
    makeQuestion: (item, { introduced }) => ({
      kind: 'choice',
      prompt: 'What is this?',
      visual: { type: 'note-value', code: noteValue(item).code },
      answer: item,
      choices: introducedChoices(VALUE_CHOICES, introduced, item),
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
    case 'choice':
      return q.answer
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
