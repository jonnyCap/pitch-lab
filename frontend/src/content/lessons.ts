/**
 * Short interactive lessons (English). Structured blocks instead of HTML so
 * content can be translated later (one file per locale) and rendered safely.
 * Inline **bold** is supported in text.
 */
import type { Clef } from '@/learn/notes'

export type LessonBlock =
  | { type: 'h'; text: string }
  | { type: 'p'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'staff'; clef: Clef; notes: string[]; harmonic?: boolean; caption?: string }
  | { type: 'keyboard'; lo: number; hi: number; mark?: number[]; caption?: string }
  /** Play button: notes as MIDI numbers, played one after another or together. */
  | { type: 'play'; label: string; midis: number[]; harmonic?: boolean }
  | { type: 'tip'; text: string }
  | { type: 'table'; head: string[]; rows: string[][] }

export interface Lesson {
  id: string
  module: 'notes' | 'intervals'
  title: string
  summary: string
  /** Deck to practise afterwards. */
  deck: string
  blocks: LessonBlock[]
}

export const LESSONS: readonly Lesson[] = [
  {
    id: 'keyboard',
    module: 'notes',
    title: 'Note names and the keyboard',
    summary: 'The musical alphabet, octaves and the black keys.',
    deck: 'keyboard',
    blocks: [
      {
        type: 'p',
        text: 'Music uses only **seven letters**: C D E F G A B. After B the alphabet starts again at C, one **octave** higher.',
      },
      {
        type: 'keyboard',
        lo: 48,
        hi: 71,
        mark: [60],
        caption: 'Two octaves. The marked key is middle C (C4).',
      },
      {
        type: 'p',
        text: 'The black keys come in groups of **two** and **three**. **C** is the white key just left of each group of two; **F** is just left of each group of three. Find those two and every other key follows.',
      },
      {
        type: 'p',
        text: 'A black key is named after its white neighbours: one step up from C is **C♯** (C sharp), which is the same key as **D♭** (D flat). The ♯ raises a note by a semitone, the ♭ lowers it.',
      },
      { type: 'play', label: 'C, D, E, F, G, A, B, C', midis: [60, 62, 64, 65, 67, 69, 71, 72] },
      { type: 'tip', text: 'Octave numbers change at every C: B3 is directly below C4.' },
    ],
  },
  {
    id: 'treble-clef',
    module: 'notes',
    title: 'The treble clef',
    summary: 'Lines, spaces and ledger lines above middle C.',
    deck: 'treble',
    blocks: [
      {
        type: 'p',
        text: 'The five lines of the staff are counted from the bottom. The **treble clef** (G clef) curls around the second line, which is **G4**.',
      },
      {
        type: 'staff',
        clef: 'treble',
        notes: ['E4', 'G4', 'B4', 'D5', 'F5'],
        caption: 'Lines: E G B D F',
      },
      {
        type: 'staff',
        clef: 'treble',
        notes: ['F4', 'A4', 'C5', 'E5'],
        caption: 'Spaces: F A C E',
      },
      {
        type: 'p',
        text: 'Notes beyond the staff get short **ledger lines**. Middle C sits on the first ledger line below the treble staff.',
      },
      {
        type: 'staff',
        clef: 'treble',
        notes: ['C4', 'D4', 'G5', 'A5'],
        caption: 'C4 and D4 below, G5 and A5 above',
      },
      { type: 'tip', text: 'Lines: "Every Good Boy Does Fine". Spaces spell "FACE".' },
    ],
  },
  {
    id: 'bass-clef',
    module: 'notes',
    title: 'The bass clef',
    summary: 'Reading the lower register.',
    deck: 'bass',
    blocks: [
      {
        type: 'p',
        text: 'The **bass clef** (F clef) puts its two dots around the fourth line, which is **F3**.',
      },
      {
        type: 'staff',
        clef: 'bass',
        notes: ['G2', 'B2', 'D3', 'F3', 'A3'],
        caption: 'Lines: G B D F A',
      },
      { type: 'staff', clef: 'bass', notes: ['A2', 'C3', 'E3', 'G3'], caption: 'Spaces: A C E G' },
      {
        type: 'p',
        text: 'Middle C is the first ledger line **above** the bass staff — the same note as the first ledger line below the treble staff.',
      },
      { type: 'staff', clef: 'bass', notes: ['C4'], caption: 'Middle C in the bass clef' },
      { type: 'tip', text: 'Lines: "Good Boys Do Fine Always". Spaces: "All Cows Eat Grass".' },
    ],
  },
  {
    id: 'accidentals',
    module: 'notes',
    title: 'Sharps, flats and enharmonics',
    summary: 'Accidentals on the staff and on the keyboard.',
    deck: 'staff-keys',
    blocks: [
      {
        type: 'p',
        text: 'An **accidental** in front of a note changes it by a semitone: **♯** raises, **♭** lowers. The note stays on its line or space — only the key you play changes.',
      },
      { type: 'staff', clef: 'treble', notes: ['F4', 'F#4', 'B4', 'Bb4'], caption: 'F, F♯, B, B♭' },
      {
        type: 'p',
        text: '**Enharmonic** notes sound the same but are spelled differently: F♯ = G♭, C♯ = D♭. There is no black key between E and F or between B and C, so **E♯** is played on the F key and **C♭** on the B key.',
      },
      {
        type: 'staff',
        clef: 'treble',
        notes: ['E#4', 'Cb5'],
        caption: 'E♯4 (the F4 key) and C♭5 (the B4 key)',
      },
      { type: 'tip', text: 'In practice, play the exact key — the octave matters.' },
    ],
  },
  {
    id: 'intervals',
    module: 'intervals',
    title: 'Intervals: size and quality',
    summary: 'Counting letter steps and semitones.',
    deck: 'sight-intervals',
    blocks: [
      {
        type: 'p',
        text: 'An **interval** is the distance between two notes. Its **number** counts letter names, including both ends: C up to E is C-D-E, a **3rd**.',
      },
      {
        type: 'p',
        text: 'Its **quality** comes from the number of semitones: C–E (4 semitones) is a **major 3rd**, C–E♭ (3 semitones) a **minor 3rd**.',
      },
      {
        type: 'table',
        head: ['Interval', 'Semitones', 'Example from C'],
        rows: [
          ['minor 2nd (m2)', '1', 'C–D♭'],
          ['major 2nd (M2)', '2', 'C–D'],
          ['minor 3rd (m3)', '3', 'C–E♭'],
          ['major 3rd (M3)', '4', 'C–E'],
          ['perfect 4th (P4)', '5', 'C–F'],
          ['tritone (TT)', '6', 'C–F♯'],
          ['perfect 5th (P5)', '7', 'C–G'],
          ['minor 6th (m6)', '8', 'C–A♭'],
          ['major 6th (M6)', '9', 'C–A'],
          ['minor 7th (m7)', '10', 'C–B♭'],
          ['major 7th (M7)', '11', 'C–B'],
          ['octave (P8)', '12', 'C–C'],
        ],
      },
      {
        type: 'staff',
        clef: 'treble',
        notes: ['C4', 'E4'],
        harmonic: true,
        caption: 'Major 3rd (stacked = harmonic)',
      },
      {
        type: 'staff',
        clef: 'treble',
        notes: ['D4', 'A4'],
        caption: 'Perfect 5th (one after the other = melodic)',
      },
      {
        type: 'tip',
        text: 'On the staff, odd intervals (3rd, 5th, 7th) go line-to-line or space-to-space; even ones (2nd, 4th, 6th) go line-to-space.',
      },
    ],
  },
  {
    id: 'intervals-ear',
    module: 'intervals',
    title: 'Hearing intervals',
    summary: 'Recognise intervals by their sound — relative pitch.',
    deck: 'ear-intervals',
    blocks: [
      {
        type: 'p',
        text: 'Every question starts on a **different random note**, so you learn the sound of the distance itself. You start with three very different intervals and new ones are added once you answer reliably.',
      },
      { type: 'play', label: 'Perfect 5th (C–G)', midis: [60, 67] },
      { type: 'play', label: 'Major 3rd (C–E)', midis: [60, 64] },
      { type: 'play', label: 'Octave (C–C)', midis: [60, 72] },
      { type: 'play', label: 'Major 3rd, together', midis: [60, 64], harmonic: true },
      { type: 'p', text: 'Many musicians use the opening of a well-known tune as a memory hook:' },
      {
        type: 'table',
        head: ['Interval', 'Rising example'],
        rows: [
          ['m2', '"Jaws" theme'],
          ['M2', '"Happy Birthday"'],
          ['m3', '"Greensleeves"'],
          ['M3', '"When the Saints Go Marching In"'],
          ['P4', '"Here Comes the Bride"'],
          ['TT', '"Maria" (West Side Story)'],
          ['P5', '"Twinkle, Twinkle, Little Star"'],
          ['M6', '"My Bonnie Lies over the Ocean"'],
          ['m7', '"Somewhere" (West Side Story)'],
          ['P8', '"Somewhere Over the Rainbow"'],
        ],
      },
      {
        type: 'tip',
        text: 'Interval hearing is relative pitch — useful alongside absolute-pitch training. Do your absolute-pitch session first on days you practise both.',
      },
    ],
  },
]

export function lessonById(id: string): Lesson | undefined {
  return LESSONS.find((l) => l.id === id)
}
