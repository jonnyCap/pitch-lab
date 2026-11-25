/**
 * Scales, keys and chords: catalogues + question generators. Spelling comes
 * from tonal (e.g. D harmonic minor = D E F G A B♭ C♯), so notation is always
 * correct; generators avoid double and unusual accidentals for readability.
 */
import { Key, Note } from 'tonal'
import { randInt, type Rng } from '@/lib/random'
import { LETTERS, parseNote } from './notes'

// --- Scales -------------------------------------------------------------------

export interface ScaleDef {
  id: string
  label: string
  /** Intervals from the tonic (tonal names), ascending, without the octave. */
  intervals: string[]
  semitones: number[]
}

const semis = (ivs: string[]) => ivs.map((i) => (Note.midi(Note.transpose('C4', i)) ?? 60) - 60)

function scale(id: string, label: string, intervals: string[]): ScaleDef {
  return { id, label, intervals, semitones: semis(intervals) }
}

export const SCALES: readonly ScaleDef[] = [
  scale('major', 'major', ['1P', '2M', '3M', '4P', '5P', '6M', '7M']),
  scale('natural-minor', 'natural minor', ['1P', '2M', '3m', '4P', '5P', '6m', '7m']),
  scale('harmonic-minor', 'harmonic minor', ['1P', '2M', '3m', '4P', '5P', '6m', '7M']),
  scale('melodic-minor', 'melodic minor', ['1P', '2M', '3m', '4P', '5P', '6M', '7M']),
  scale('dorian', 'Dorian', ['1P', '2M', '3m', '4P', '5P', '6M', '7m']),
  scale('phrygian', 'Phrygian', ['1P', '2m', '3m', '4P', '5P', '6m', '7m']),
  scale('lydian', 'Lydian', ['1P', '2M', '3M', '4A', '5P', '6M', '7M']),
  scale('mixolydian', 'Mixolydian', ['1P', '2M', '3M', '4P', '5P', '6M', '7m']),
  scale('locrian', 'Locrian', ['1P', '2m', '3m', '4P', '5d', '6m', '7m']),
]
export const SCALE_ORDER_SIGHT = [
  'major',
  'natural-minor',
  'harmonic-minor',
  'melodic-minor',
  'dorian',
  'mixolydian',
  'lydian',
  'phrygian',
  'locrian',
]
/** By ear: the clearest contrasts first. */
export const SCALE_ORDER_EAR = [
  'major',
  'natural-minor',
  'harmonic-minor',
  'dorian',
  'mixolydian',
  'melodic-minor',
  'lydian',
  'phrygian',
]

export function scaleById(id: string): ScaleDef {
  const s = SCALES.find((x) => x.id === id)
  if (!s) throw new Error(`unknown scale ${id}`)
  return s
}

// --- Chords -------------------------------------------------------------------

export interface ChordDef {
  id: string
  label: string
  short: string
  intervals: string[]
  semitones: number[]
  seventh: boolean
}

function chord(id: string, label: string, short: string, intervals: string[]): ChordDef {
  return {
    id,
    label,
    short,
    intervals,
    semitones: semis(intervals),
    seventh: intervals.length === 4,
  }
}

export const CHORDS: readonly ChordDef[] = [
  chord('major', 'major triad', 'maj', ['1P', '3M', '5P']),
  chord('minor', 'minor triad', 'min', ['1P', '3m', '5P']),
  chord('dim', 'diminished triad', 'dim', ['1P', '3m', '5d']),
  chord('aug', 'augmented triad', 'aug', ['1P', '3M', '5A']),
  chord('dom7', 'dominant 7th', '7', ['1P', '3M', '5P', '7m']),
  chord('maj7', 'major 7th', 'maj7', ['1P', '3M', '5P', '7M']),
  chord('min7', 'minor 7th', 'm7', ['1P', '3m', '5P', '7m']),
  chord('half-dim7', 'half-diminished 7th', 'ø7', ['1P', '3m', '5d', '7m']),
  chord('dim7', 'diminished 7th', '°7', ['1P', '3m', '5d', '7d']),
]
export const CHORD_ORDER = [
  'major',
  'minor',
  'dim',
  'aug',
  'dom7',
  'maj7',
  'min7',
  'half-dim7',
  'dim7',
]

export function chordById(id: string): ChordDef {
  const c = CHORDS.find((x) => x.id === id)
  if (!c) throw new Error(`unknown chord ${id}`)
  return c
}

export const INVERSION_LABELS = ['root position', '1st inversion', '2nd inversion', '3rd inversion']

// --- Keys ---------------------------------------------------------------------

/** The 15 major keys in circle-of-fifths teaching order (fewest accidentals first). */
export const MAJOR_KEYS = [
  'C',
  'G',
  'F',
  'D',
  'Bb',
  'A',
  'Eb',
  'E',
  'Ab',
  'B',
  'Db',
  'F#',
  'Gb',
  'C#',
  'Cb',
]

export interface KeyInfo {
  major: string
  minor: string
  /** + sharps / − flats */
  alteration: number
}

export function keyInfo(major: string): KeyInfo {
  const k = Key.majorKey(major)
  return { major, minor: k.minorRelative, alteration: k.alteration }
}

/** Circle of fifths positions (clockwise from C), with enharmonic alternatives at the bottom. */
export const CIRCLE = [
  { major: 'C', alt: null },
  { major: 'G', alt: null },
  { major: 'D', alt: null },
  { major: 'A', alt: null },
  { major: 'E', alt: null },
  { major: 'B', alt: 'Cb' },
  { major: 'F#', alt: 'Gb' },
  { major: 'Db', alt: 'C#' },
  { major: 'Ab', alt: null },
  { major: 'Eb', alt: null },
  { major: 'Bb', alt: null },
  { major: 'F', alt: null },
] as const

// --- Question generators ------------------------------------------------------

const PLAIN = new Set(['', '#', 'b'])
const ODD = new Set(['E#', 'B#', 'Cb', 'Fb'])
function readable(names: readonly string[]): boolean {
  return names.every((n) => {
    const p = parseNote(n)
    return PLAIN.has(p.acc) && !ODD.has(`${p.letter}${p.acc}`)
  })
}

function randomRoot(rng: Rng, octaves: readonly number[]): string {
  const letter = LETTERS[randInt(rng, 0, 7)]!
  const r = rng()
  const acc = r < 0.65 ? '' : r < 0.83 ? '#' : 'b'
  return `${letter}${acc}${octaves[randInt(rng, 0, octaves.length)]}`
}

function stack(root: string, intervals: readonly string[]): string[] {
  return intervals.map((i) => parseNote(Note.transpose(root, i)).name)
}

/** A scale from a given tonic (with octave), e.g. ('Eb4', 'major') → E♭4 … E♭5. */
export function makeScaleNotesFrom(root: string, id: string): string[] {
  const s = scaleById(id)
  return [...stack(root, s.intervals), parseNote(Note.transpose(root, '8P')).name]
}

/** Ascending scale incl. the octave on the treble staff (C4–C6), readable spelling. */
export function makeScaleNotes(id: string, rng: Rng): string[] {
  const s = scaleById(id)
  for (let attempt = 0; attempt < 300; attempt++) {
    const root = randomRoot(rng, [4])
    const notes = [...stack(root, s.intervals), parseNote(Note.transpose(root, '8P')).name]
    if (readable(notes) && parseNote(notes.at(-1)!).midi <= 84) return notes
  }
  throw new Error(`could not spell scale ${id}`)
}

/** A chord (optionally inverted) on the treble staff, bottom note C4–A4, top ≤ C6. */
export function makeChordNotes(id: string, inversion: number, rng: Rng): string[] {
  const c = chordById(id)
  for (let attempt = 0; attempt < 300; attempt++) {
    // Inverted chords need a lower root so the bass note still lands around C4–A4.
    const root = randomRoot(rng, inversion > 0 ? [3, 4] : [4])
    let notes = stack(root, c.intervals)
    for (let i = 0; i < inversion; i++) {
      const [low, ...rest] = notes
      notes = [...rest, parseNote(Note.transpose(low!, '8P')).name]
    }
    const lo = parseNote(notes[0]!).midi
    const hi = parseNote(notes.at(-1)!).midi
    if (readable(notes) && lo >= 60 && lo <= 69 && hi <= 84) return notes
  }
  throw new Error(`could not spell chord ${id}/${inversion}`)
}

/** MIDI notes for ear training: random root, both ends within C3–C6. */
export function earMidis(semitones: readonly number[], rng: Rng, lo = 48, hi = 84): number[] {
  const span = Math.max(...semitones)
  const root = randInt(rng, lo, hi - span + 1)
  return semitones.map((s) => root + s)
}
