/**
 * Rhythm: note values, pattern generation per level, and tap-along scoring.
 *
 * Durations are in beats (quarter note = 1). Tap scoring matches each written
 * note onset to the nearest unused tap within a tolerance window and grades the
 * timing error; misses and extra taps cost points. A latency calibration
 * (tapping along with clicks) is subtracted first, so device/audio delay does
 * not count as the learner's error.
 */
import { randInt, type Rng } from '@/lib/random'

export interface NoteValue {
  id: string
  /** VexFlow duration code ('q', '8', 'hd', 'qr', …). */
  code: string
  label: string
  beats: number
  rest: boolean
}

export const NOTE_VALUES: readonly NoteValue[] = [
  { id: 'w', code: 'w', label: 'whole note · 4 beats', beats: 4, rest: false },
  { id: 'h', code: 'h', label: 'half note · 2 beats', beats: 2, rest: false },
  { id: 'q', code: 'q', label: 'quarter note · 1 beat', beats: 1, rest: false },
  { id: '8', code: '8', label: 'eighth note · ½ beat', beats: 0.5, rest: false },
  { id: '16', code: '16', label: 'sixteenth note · ¼ beat', beats: 0.25, rest: false },
  { id: 'hd', code: 'hd', label: 'dotted half note · 3 beats', beats: 3, rest: false },
  { id: 'qd', code: 'qd', label: 'dotted quarter note · 1½ beats', beats: 1.5, rest: false },
  { id: 'wr', code: 'wr', label: 'whole rest · 4 beats', beats: 4, rest: true },
  { id: 'hr', code: 'hr', label: 'half rest · 2 beats', beats: 2, rest: true },
  { id: 'qr', code: 'qr', label: 'quarter rest · 1 beat', beats: 1, rest: true },
  { id: '8r', code: '8r', label: 'eighth rest · ½ beat', beats: 0.5, rest: true },
  { id: '16r', code: '16r', label: 'sixteenth rest · ¼ beat', beats: 0.25, rest: true },
]
export const NOTE_VALUE_ORDER = [
  'q',
  'h',
  'w',
  '8',
  'qr',
  'hd',
  '16',
  'hr',
  'wr',
  '8r',
  'qd',
  '16r',
]

export function noteValue(id: string): NoteValue {
  const v = NOTE_VALUES.find((n) => n.id === id)
  if (!v) throw new Error(`unknown note value ${id}`)
  return v
}

/** One written event of a rhythm pattern. */
export interface RhythmEvent {
  code: string
  beats: number
  rest: boolean
}

const ev = (id: string): RhythmEvent => {
  const v = noteValue(id)
  return { code: v.code, beats: v.beats, rest: v.rest }
}

/**
 * Building blocks per level; every cell fills whole beats so bar lines and
 * beaming stay simple. Level 1: quarters/halves/whole; 2: + eighths and quarter
 * rests; 3: + dotted rhythms and eighth rests; 4: + sixteenths and syncopation.
 */
const CELLS: Record<number, RhythmEvent[][]> = {
  1: [[ev('q')], [ev('q')], [ev('h')], [ev('qr')]],
  2: [[ev('q')], [ev('8'), ev('8')], [ev('8'), ev('8')], [ev('h')], [ev('qr')]],
  3: [
    [ev('q')],
    [ev('8'), ev('8')],
    [ev('qd'), ev('8')],
    [ev('8r'), ev('8')],
    [ev('hd')],
    [ev('qr')],
  ],
  4: [
    [ev('8'), ev('8')],
    [ev('16'), ev('16'), ev('16'), ev('16')],
    [ev('8'), ev('16'), ev('16')],
    [ev('16'), ev('16'), ev('8')],
    [ev('8'), ev('q'), ev('8')],
    [ev('qd'), ev('8')],
    [ev('q')],
  ],
}
export const RHYTHM_LEVELS = [1, 2, 3, 4] as const

const cellBeats = (c: RhythmEvent[]) => c.reduce((s, e) => s + e.beats, 0)

/** Random pattern of `bars` bars in 4/4. The first event is always a note. */
export function generatePattern(level: number, rng: Rng, bars = 2): RhythmEvent[][] {
  const cells = CELLS[level] ?? CELLS[1]!
  const out: RhythmEvent[][] = []
  for (let b = 0; b < bars; b++) {
    const bar: RhythmEvent[] = []
    let left = 4
    while (left > 0) {
      const fitting = cells.filter((c) => cellBeats(c) <= left)
      const c = fitting[randInt(rng, 0, fitting.length)]!
      bar.push(...c.map((e) => ({ ...e })))
      left -= cellBeats(c)
    }
    out.push(bar)
  }
  if (out[0]![0]!.rest)
    out[0]![0] = { ...out[0]![0]!, rest: false, code: out[0]![0]!.code.replace('r', '') }
  return out
}

/** Onset times (in beats from the start) of the notes that should be tapped. */
export function noteOnsets(bars: readonly (readonly RhythmEvent[])[]): number[] {
  const out: number[] = []
  let t = 0
  for (const bar of bars) {
    for (const e of bar) {
      if (!e.rest) out.push(t)
      t += e.beats
    }
  }
  return out
}

export interface TapResult {
  /** 0–1 */
  score: number
  hits: number
  misses: number
  extras: number
  /** Mean signed error of hits (ms; negative = early). */
  meanErrorMs: number | null
  /** Mean absolute error of hits (ms). */
  meanAbsErrorMs: number | null
  /** Per expected onset: error in ms or null when missed. */
  perNote: (number | null)[]
}

/** Full marks within this error; credit falls linearly to 0 at the window edge. */
export const PERFECT_MS = 40
export const MAX_WINDOW_MS = 180

/**
 * Scores taps against expected onsets (both in ms on the same clock, taps
 * already latency-corrected). Greedy matching in time order within a window of
 * min(180 ms, half the shortest gap between onsets).
 */
export function scoreTaps(expectedMs: readonly number[], tapsMs: readonly number[]): TapResult {
  const gaps = expectedMs.slice(1).map((t, i) => t - expectedMs[i]!)
  const window = Math.min(MAX_WINDOW_MS, gaps.length ? Math.min(...gaps) / 2 : MAX_WINDOW_MS)
  const taps = [...tapsMs].sort((a, b) => a - b)
  const used = new Set<number>()
  const perNote: (number | null)[] = []
  let credit = 0
  for (const t of expectedMs) {
    let best = -1
    for (let j = 0; j < taps.length; j++) {
      if (used.has(j)) continue
      const d = Math.abs(taps[j]! - t)
      if (d <= window && (best < 0 || d < Math.abs(taps[best]! - t))) best = j
    }
    if (best < 0) {
      perNote.push(null)
      continue
    }
    used.add(best)
    const err = taps[best]! - t
    perNote.push(err)
    const a = Math.abs(err)
    credit += a <= PERFECT_MS ? 1 : Math.max(0, 1 - (a - PERFECT_MS) / (window - PERFECT_MS))
  }
  const hits = perNote.filter((e) => e !== null) as number[]
  const extras = taps.length - used.size
  const n = expectedMs.length
  const score = n ? Math.max(0, (credit - 0.5 * extras) / n) : 0
  return {
    score,
    hits: hits.length,
    misses: n - hits.length,
    extras,
    meanErrorMs: hits.length ? hits.reduce((s, e) => s + e, 0) / hits.length : null,
    meanAbsErrorMs: hits.length ? hits.reduce((s, e) => s + Math.abs(e), 0) / hits.length : null,
    perNote,
  }
}

/**
 * Latency from a calibration run (tapping along with clicks): the median
 * offset tap − click, ignoring taps more than 250 ms from any click.
 */
export function calibrateLatency(
  clicksMs: readonly number[],
  tapsMs: readonly number[],
): number | null {
  const offsets: number[] = []
  for (const tap of tapsMs) {
    let best: number | null = null
    for (const c of clicksMs)
      if (best === null || Math.abs(tap - c) < Math.abs(tap - best)) best = c
    if (best !== null && Math.abs(tap - best) <= 250) offsets.push(tap - best)
  }
  if (offsets.length < 4) return null
  offsets.sort((a, b) => a - b)
  const mid = Math.floor(offsets.length / 2)
  return offsets.length % 2 ? offsets[mid]! : (offsets[mid - 1]! + offsets[mid]!) / 2
}

/** A level is passed after this many patterns scoring at least PASS_SCORE. */
export const PASS_SCORE = 0.85
export const PASSES_TO_ADVANCE = 3

// --- Progress for the tap-along exercises ----------------------------------

export interface RhythmProgress {
  schema: 1
  level: number
  /** Passing patterns at the current level. */
  passes: number
  /** Device tap latency from calibration (ms), null until calibrated. */
  latencyMs: number | null
  bpm: number
  best: Record<number, number>
}

export function initialRhythmProgress(): RhythmProgress {
  return { schema: 1, level: 1, passes: 0, latencyMs: null, bpm: 80, best: {} }
}

export function normalizeRhythmProgress(p: Partial<RhythmProgress> | undefined): RhythmProgress {
  return p?.schema === 1 ? { ...initialRhythmProgress(), ...p } : initialRhythmProgress()
}

/** Records one tap-along result; advances a level after PASSES_TO_ADVANCE good patterns. */
export function applyRhythmResult(
  p: RhythmProgress,
  score: number,
): { progress: RhythmProgress; levelUp: boolean } {
  const best = { ...p.best, [p.level]: Math.max(p.best[p.level] ?? 0, score) }
  if (score < PASS_SCORE) return { progress: { ...p, best }, levelUp: false }
  const passes = p.passes + 1
  const maxLevel = RHYTHM_LEVELS.at(-1)!
  if (passes >= PASSES_TO_ADVANCE && p.level < maxLevel) {
    return { progress: { ...p, best, level: p.level + 1, passes: 0 }, levelUp: true }
  }
  return { progress: { ...p, best, passes }, levelUp: false }
}

/** Beat duration in ms. */
export const beatMs = (bpm: number) => 60000 / bpm
