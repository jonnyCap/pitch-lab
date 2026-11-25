/**
 * Interval catalogue (simple intervals m2 … P8) with tonal spellings, plus
 * question generators for ear training (random root on every question, so
 * no fixed reference pitch is ever trained) and sight reading (correctly
 * spelled on the staff).
 */
import { Interval, Note } from 'tonal'
import { randInt, type Rng } from '@/lib/random'
import { LETTERS, parseNote } from './notes'

export interface IntervalDef {
  id: string
  /** tonal interval name, e.g. '3m'. */
  tonal: string
  semitones: number
  short: string
  long: string
}

export const INTERVALS: readonly IntervalDef[] = [
  { id: 'm2', tonal: '2m', semitones: 1, short: 'm2', long: 'minor 2nd' },
  { id: 'M2', tonal: '2M', semitones: 2, short: 'M2', long: 'major 2nd' },
  { id: 'm3', tonal: '3m', semitones: 3, short: 'm3', long: 'minor 3rd' },
  { id: 'M3', tonal: '3M', semitones: 4, short: 'M3', long: 'major 3rd' },
  { id: 'P4', tonal: '4P', semitones: 5, short: 'P4', long: 'perfect 4th' },
  { id: 'TT', tonal: '4A', semitones: 6, short: 'TT', long: 'tritone' },
  { id: 'P5', tonal: '5P', semitones: 7, short: 'P5', long: 'perfect 5th' },
  { id: 'm6', tonal: '6m', semitones: 8, short: 'm6', long: 'minor 6th' },
  { id: 'M6', tonal: '6M', semitones: 9, short: 'M6', long: 'major 6th' },
  { id: 'm7', tonal: '7m', semitones: 10, short: 'm7', long: 'minor 7th' },
  { id: 'M7', tonal: '7M', semitones: 11, short: 'M7', long: 'major 7th' },
  { id: 'P8', tonal: '8P', semitones: 12, short: 'P8', long: 'octave' },
]

/** Teaching order: very distinct intervals first, close neighbours later. */
export const INTERVAL_ORDER = [
  'P5',
  'M3',
  'P8',
  'P4',
  'm3',
  'M2',
  'M6',
  'm6',
  'm2',
  'm7',
  'M7',
  'TT',
]

export function intervalById(id: string): IntervalDef {
  const d = INTERVALS.find((i) => i.id === id)
  if (!d) throw new Error(`unknown interval ${id}`)
  return d
}

/** Catalogue id for two spelled notes (lower first), or null if not a simple interval in the catalogue. */
export function identifyInterval(lower: string, upper: string): string | null {
  const name = Interval.distance(lower, upper)
  const d = INTERVALS.find((i) => i.tonal === name || (i.id === 'TT' && name === '5d'))
  return d?.id ?? null
}

export type EarMode = 'asc' | 'desc' | 'harm'

export interface EarQuestion {
  interval: string
  mode: EarMode
  /** MIDI notes in playback order (asc: low→high, desc: high→low, harm: together). */
  midis: [number, number]
}

/** Random root so that both notes lie within [lo, hi] (default C3–C6). */
export function makeEarQuestion(
  interval: string,
  mode: EarMode,
  rng: Rng,
  lo = 48,
  hi = 84,
): EarQuestion {
  const semis = intervalById(interval).semitones
  const root = randInt(rng, lo, hi - semis + 1)
  const pair: [number, number] = [root, root + semis]
  return { interval, mode, midis: mode === 'desc' ? [pair[1], pair[0]] : pair }
}

export interface SightQuestion {
  interval: string
  lower: string
  upper: string
  harmonic: boolean
}

const PLAIN_ACCS = new Set(['', '#', 'b'])
/** Spellings that are correct but confusing for beginners. */
const ODD = new Set(['E#', 'B#', 'Cb', 'Fb'])

function plain(name: string): boolean {
  const n = parseNote(name)
  return PLAIN_ACCS.has(n.acc) && !ODD.has(`${n.letter}${n.acc}`)
}

/**
 * A correctly spelled interval on the treble staff: lower note between C4 and
 * G5 (naturals mostly, sometimes ♯/♭), upper = lower transposed by the interval,
 * both within C4–C6 and without double or unusual accidentals.
 */
export function makeSightQuestion(interval: string, rng: Rng): SightQuestion {
  const tonalName = intervalById(interval).tonal
  for (let attempt = 0; attempt < 200; attempt++) {
    const letter = LETTERS[randInt(rng, 0, 7)]!
    const octave = 4 + (rng() < 0.35 ? 1 : 0)
    const r = rng()
    const acc = r < 0.7 ? '' : r < 0.85 ? '#' : 'b'
    const lower = `${letter}${acc}${octave}`
    if (!plain(lower)) continue
    const upper = Note.transpose(lower, tonalName)
    if (!upper || !plain(upper)) continue
    const lo = parseNote(lower).midi
    const up = parseNote(upper).midi
    if (lo < 60 || up > 84) continue
    return {
      interval,
      lower: parseNote(lower).name,
      upper: parseNote(upper).name,
      harmonic: rng() < 0.5,
    }
  }
  throw new Error(`could not place interval ${interval}`)
}
