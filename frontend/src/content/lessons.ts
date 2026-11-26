/**
 * Short interactive lessons (English). Structured blocks instead of HTML so
 * content can be translated later (one file per locale) and rendered safely.
 * Inline **bold** is supported in text.
 */
import type { Clef } from '@/learn/notes'
import { SCALE_PATTERNS, type ChordQuality } from '@/components/viz/geometry'

export type LessonBlock =
  | { type: 'h'; text: string }
  | { type: 'p'; text: string }
  | { type: 'list'; items: string[] }
  | {
      type: 'staff'
      clef: Clef
      notes: string[]
      harmonic?: boolean
      keySignature?: string
      caption?: string
      /** Show a play button for the written notes. */
      play?: boolean
    }
  /** Interactive circle of fifths. */
  | { type: 'circle' }
  /** Rhythm example (bars of note-value ids) with a play button. */
  | { type: 'rhythm'; bars: string[][]; caption?: string }
  | { type: 'keyboard'; lo: number; hi: number; mark?: number[]; caption?: string }
  /** Play button: notes as MIDI numbers, played one after another or together. */
  | { type: 'play'; label: string; midis: number[]; harmonic?: boolean }
  | { type: 'tip'; text: string }
  /** Animated 3D figure: interval ring, scale staircase or chord stack (all tap-to-hear). */
  | { type: 'viz'; viz: 'interval'; lower: number; upper: number; caption: string }
  | {
      type: 'viz'
      viz: 'scale'
      tonic: number
      pattern: readonly number[]
      name: string
      caption: string
    }
  | {
      type: 'viz'
      viz: 'chord'
      root: number
      quality: ChordQuality
      inversion?: number
      caption: string
    }
  | { type: 'table'; head: string[]; rows: string[][] }

export interface Lesson {
  id: string
  module: 'notes' | 'intervals' | 'harmony' | 'rhythm'
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
        type: 'viz',
        viz: 'interval',
        lower: 60,
        upper: 64,
        caption: 'Count the semitones round the chroma circle: C up to E is 4 — a major 3rd.',
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
      {
        type: 'viz',
        viz: 'interval',
        lower: 60,
        upper: 67,
        caption: 'A perfect 5th spans 7 of the 12 pitch classes — over half the circle.',
      },
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

const HARMONY_LESSONS: Lesson[] = [
  {
    id: 'scales',
    module: 'harmony',
    title: 'Major and minor scales',
    summary: 'Whole and half steps; natural, harmonic and melodic minor.',
    deck: 'scales-sight',
    blocks: [
      {
        type: 'p',
        text: 'A **scale** is a ladder of seven notes, one per letter name, from a tonic up to its octave. The pattern of **whole steps** (W, 2 semitones) and **half steps** (H, 1 semitone) gives each scale its colour.',
      },
      {
        type: 'viz',
        viz: 'scale',
        tonic: 60,
        pattern: SCALE_PATTERNS.major,
        name: 'C major',
        caption: 'Half steps are the short risers: only E–F and B–C.',
      },
      {
        type: 'staff',
        clef: 'treble',
        notes: ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'],
        caption: 'C major: W W H W W W H',
        play: true,
      },
      {
        type: 'staff',
        clef: 'treble',
        notes: ['A4', 'B4', 'C5', 'D5', 'E5', 'F5', 'G5', 'A5'],
        caption: 'A natural minor: W H W W H W W',
        play: true,
      },
      {
        type: 'p',
        text: 'The **harmonic minor** raises the 7th degree, creating a strong pull back to the tonic (and a distinctive 1½-step gap between degrees 6 and 7).',
      },
      {
        type: 'staff',
        clef: 'treble',
        notes: ['A4', 'B4', 'C5', 'D5', 'E5', 'F5', 'G#5', 'A5'],
        caption: 'A harmonic minor',
        play: true,
      },
      {
        type: 'p',
        text: 'The **melodic minor** raises the 6th **and** 7th degrees going up. (In classical music it usually descends as natural minor.)',
      },
      {
        type: 'staff',
        clef: 'treble',
        notes: ['A4', 'B4', 'C5', 'D5', 'E5', 'F#5', 'G#5', 'A5'],
        caption: 'A melodic minor (ascending)',
        play: true,
      },
      {
        type: 'tip',
        text: 'Major vs. minor: listen to the **3rd** degree — a major 3rd sounds bright, a minor 3rd darker.',
      },
    ],
  },
  {
    id: 'modes',
    module: 'harmony',
    title: 'The modes',
    summary: 'Seven scales from the same white keys.',
    deck: 'scales-ear',
    blocks: [
      {
        type: 'p',
        text: 'Play only the white keys, but start on a different note each time, and you get the seven **modes**. Each has its own characteristic note compared with major or natural minor.',
      },
      {
        type: 'table',
        head: ['Mode', 'White keys from', 'Character'],
        rows: [
          ['Ionian (= major)', 'C', 'bright, stable'],
          ['Dorian', 'D', 'minor with a raised 6th — soft, "folky"'],
          ['Phrygian', 'E', 'minor with a lowered 2nd — dark, Spanish'],
          ['Lydian', 'F', 'major with a raised 4th — floating, dreamy'],
          ['Mixolydian', 'G', 'major with a lowered 7th — bluesy, rock'],
          ['Aeolian (= natural minor)', 'A', 'sad, serious'],
          ['Locrian', 'B', 'lowered 2nd and 5th — unstable'],
        ],
      },
      {
        type: 'viz',
        viz: 'scale',
        tonic: 62,
        pattern: SCALE_PATTERNS.dorian,
        name: 'D Dorian',
        caption: 'The white keys from D: the half steps move to E–F and B–C, a different shape.',
      },
      {
        type: 'staff',
        clef: 'treble',
        notes: ['D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'D5'],
        caption: 'D Dorian',
        play: true,
      },
      {
        type: 'staff',
        clef: 'treble',
        notes: ['G4', 'A4', 'B4', 'C5', 'D5', 'E5', 'F5', 'G5'],
        caption: 'G Mixolydian',
        play: true,
      },
      {
        type: 'staff',
        clef: 'treble',
        notes: ['F4', 'G4', 'A4', 'B4', 'C5', 'D5', 'E5', 'F5'],
        caption: 'F Lydian',
        play: true,
      },
      {
        type: 'tip',
        text: 'By ear, first decide major-ish or minor-ish (the 3rd), then listen for the one note that differs.',
      },
    ],
  },
  {
    id: 'key-signatures',
    module: 'harmony',
    title: 'Key signatures and the circle of fifths',
    summary: 'Order of sharps and flats, relative minors.',
    deck: 'key-signatures',
    blocks: [
      {
        type: 'p',
        text: 'A **key signature** lists the sharps or flats of a key once, at the start of each line, instead of before every note.',
      },
      {
        type: 'p',
        text: 'Sharps always appear in the order **F C G D A E B**, flats in the reverse order **B E A D G C F**.',
      },
      {
        type: 'staff',
        clef: 'treble',
        notes: [],
        keySignature: 'C#',
        caption: 'All seven sharps (C♯ major)',
      },
      {
        type: 'staff',
        clef: 'treble',
        notes: [],
        keySignature: 'Cb',
        caption: 'All seven flats (C♭ major)',
      },
      {
        type: 'list',
        items: [
          '**Sharp keys:** the major key is a semitone above the **last sharp** (last sharp C♯ → D major).',
          '**Flat keys:** the major key is the **second-to-last flat** (B♭ E♭ A♭ → E♭ major). One flat is F major.',
          '**Relative minor:** three semitones (a minor 3rd) below the major key, same signature (C major ↔ A minor).',
        ],
      },
      {
        type: 'p',
        text: 'Going clockwise around the **circle of fifths** adds one sharp (or removes a flat) per step. Tap a key:',
      },
      { type: 'circle' },
    ],
  },
  {
    id: 'triads',
    module: 'harmony',
    title: 'Triads',
    summary: 'Major, minor, diminished and augmented chords.',
    deck: 'chords-sight',
    blocks: [
      {
        type: 'p',
        text: 'A **triad** stacks two 3rds on a **root**: root, 3rd and 5th. On the staff that is three notes on consecutive lines (or spaces).',
      },
      {
        type: 'table',
        head: ['Triad', 'Lower 3rd', 'Upper 3rd', 'From C'],
        rows: [
          ['major', 'M3', 'm3', 'C E G'],
          ['minor', 'm3', 'M3', 'C E♭ G'],
          ['diminished', 'm3', 'm3', 'C E♭ G♭'],
          ['augmented', 'M3', 'M3', 'C E G♯'],
        ],
      },
      {
        type: 'viz',
        viz: 'chord',
        root: 60,
        quality: 'maj',
        caption: 'Two stacked thirds: a major 3rd (M3) under a minor 3rd (m3).',
      },
      {
        type: 'staff',
        clef: 'treble',
        notes: ['C4', 'E4', 'G4'],
        harmonic: true,
        caption: 'C major',
        play: true,
      },
      {
        type: 'staff',
        clef: 'treble',
        notes: ['C4', 'Eb4', 'G4'],
        harmonic: true,
        caption: 'C minor',
        play: true,
      },
      {
        type: 'staff',
        clef: 'treble',
        notes: ['B4', 'D5', 'F5'],
        harmonic: true,
        caption: 'B diminished',
        play: true,
      },
      {
        type: 'staff',
        clef: 'treble',
        notes: ['C4', 'E4', 'G#4'],
        harmonic: true,
        caption: 'C augmented',
        play: true,
      },
    ],
  },
  {
    id: 'sevenths-inversions',
    module: 'harmony',
    title: 'Seventh chords and inversions',
    summary: 'Adding a 7th; which note is in the bass.',
    deck: 'inversions',
    blocks: [
      {
        type: 'p',
        text: 'Stack one more 3rd and you get a **seventh chord**. The five common ones:',
      },
      {
        type: 'table',
        head: ['Chord', 'Symbol', 'From C'],
        rows: [
          ['dominant 7th', 'C7', 'C E G B♭'],
          ['major 7th', 'Cmaj7', 'C E G B'],
          ['minor 7th', 'Cm7', 'C E♭ G B♭'],
          ['half-diminished 7th', 'Cø7', 'C E♭ G♭ B♭'],
          ['diminished 7th', 'C°7', 'C E♭ G♭ B♭♭'],
        ],
      },
      {
        type: 'staff',
        clef: 'treble',
        notes: ['G4', 'B4', 'D5', 'F5'],
        harmonic: true,
        caption: 'G7 (dominant 7th)',
        play: true,
      },
      {
        type: 'viz',
        viz: 'chord',
        root: 67,
        quality: 'dom7',
        caption: 'G7 as three stacked thirds. Pick an inversion to see the bass note change.',
      },
      {
        type: 'p',
        text: 'An **inversion** puts a chord tone other than the root in the bass: **1st inversion** = 3rd in the bass, **2nd inversion** = 5th in the bass, **3rd inversion** (seventh chords only) = 7th in the bass.',
      },
      {
        type: 'staff',
        clef: 'treble',
        notes: ['C4', 'E4', 'G4'],
        harmonic: true,
        caption: 'C major, root position',
        play: true,
      },
      {
        type: 'staff',
        clef: 'treble',
        notes: ['E4', 'G4', 'C5'],
        harmonic: true,
        caption: '1st inversion (E in the bass)',
        play: true,
      },
      {
        type: 'staff',
        clef: 'treble',
        notes: ['G4', 'C5', 'E5'],
        harmonic: true,
        caption: '2nd inversion (G in the bass)',
        play: true,
      },
      {
        type: 'tip',
        text: 'To find the root of an inverted triad, rearrange the notes into stacked 3rds; the bottom one is the root. A 4th between two notes means the upper one is the root.',
      },
    ],
  },
  {
    id: 'hearing-chords',
    module: 'harmony',
    title: 'Hearing chord qualities',
    summary: 'Bright, dark, tense and floating.',
    deck: 'chords-ear',
    blocks: [
      {
        type: 'p',
        text: 'Each chord is played together first, then note by note. Every question starts on a random root.',
      },
      { type: 'play', label: 'Major (bright, stable)', midis: [60, 64, 67], harmonic: true },
      { type: 'play', label: 'Minor (darker)', midis: [60, 63, 67], harmonic: true },
      { type: 'play', label: 'Diminished (tense, small)', midis: [60, 63, 66], harmonic: true },
      {
        type: 'play',
        label: 'Augmented (unresolved, dreamy)',
        midis: [60, 64, 68],
        harmonic: true,
      },
      {
        type: 'play',
        label: 'Dominant 7th (wants to move on)',
        midis: [60, 64, 67, 70],
        harmonic: true,
      },
      { type: 'play', label: 'Major 7th (soft, jazzy)', midis: [60, 64, 67, 71], harmonic: true },
      {
        type: 'tip',
        text: 'Listen to the top note in the arpeggio: a major 7th is one semitone below the octave, a minor 7th a whole tone below.',
      },
    ],
  },
]

const RHYTHM_LESSONS: Lesson[] = [
  {
    id: 'note-values',
    module: 'rhythm',
    title: 'Note values and time signatures',
    summary: 'How long notes and rests last; counting in 4/4.',
    deck: 'note-values',
    blocks: [
      {
        type: 'p',
        text: 'The shape of a note tells you how long it lasts, counted in **beats**. In 4/4 time a **quarter note** gets one beat.',
      },
      {
        type: 'table',
        head: ['Note', 'Beats in 4/4'],
        rows: [
          ['whole', '4'],
          ['half', '2'],
          ['quarter', '1'],
          ['eighth', '½'],
          ['sixteenth', '¼'],
        ],
      },
      {
        type: 'rhythm',
        bars: [['w'], ['h', 'h'], ['q', 'q', 'q', 'q'], ['8', '8', '8', '8', '8', '8', '8', '8']],
        caption: 'Whole, half, quarter and eighth notes',
      },
      {
        type: 'p',
        text: 'A **dot** adds half the note’s value: a dotted half note lasts 3 beats, a dotted quarter 1½. **Rests** are silences of the same lengths.',
      },
      {
        type: 'rhythm',
        bars: [
          ['hd', 'q'],
          ['qd', '8', 'h'],
          ['q', 'qr', 'q', 'qr'],
          ['8r', '8', '8r', '8', 'hr'],
        ],
        caption: 'Dots and rests',
      },
      {
        type: 'p',
        text: 'The **time signature** says how many beats are in a bar (top number) and which note gets the beat (bottom: 4 = quarter). Common ones: **4/4**, **3/4** (waltz), **2/4** (march), and **6/8** (two groups of three eighths).',
      },
      {
        type: 'tip',
        text: 'Count out loud: "1 and 2 and 3 and 4 and" — eighth notes fall on the numbers and the "ands".',
      },
    ],
  },
]

export const ALL_LESSONS: readonly Lesson[] = [...LESSONS, ...HARMONY_LESSONS, ...RHYTHM_LESSONS]

export function lessonById(id: string): Lesson | undefined {
  return ALL_LESSONS.find((l) => l.id === id)
}
