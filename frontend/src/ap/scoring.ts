/**
 * Per-trial scoring and per-level summaries.
 * A response is correct only if it names the exact pitch class within the
 * deadline — semitone errors are errors (Wong et al. 2020/2025). For an
 * out-of-set distractor tone the only correct answer is "none" (not in my set).
 */
import { circularSemitoneError, type PitchClass } from '@/music/pitch'
import type { TrialResponse } from '@/data/db'

export interface ScoredResponse {
  correct: boolean
  /** Circular distance to the target (0–6); null for timeouts and "none" answers. */
  semitoneError: number | null
}

export function scoreResponse(
  target: PitchClass,
  response: TrialResponse,
  rtMs: number | null,
  deadlineMs: number | null,
  isDistractor = false,
): ScoredResponse {
  const inTime = deadlineMs === null || rtMs === null || rtMs <= deadlineMs
  if (response === 'timeout') return { correct: false, semitoneError: null }
  if (response === 'none') return { correct: isDistractor && inTime, semitoneError: null }
  const semitoneError = circularSemitoneError(target, response)
  return { correct: !isDistractor && semitoneError === 0 && inTime, semitoneError }
}

export interface TrialOutcome {
  target: PitchClass
  response: TrialResponse
  correct: boolean
  semitoneError: number | null
  rtMs: number | null
  timbre: string
  octave: number
  isDistractor?: boolean
  special?: boolean
}

export interface PitchStat {
  pitchClass: PitchClass
  n: number
  correct: number
  accuracy: number
}

export interface Confusion {
  target: PitchClass
  response: PitchClass | 'none'
  count: number
}

export interface LevelSummary {
  n: number
  correct: number
  accuracy: number
  passed: boolean
  timeouts: number
  meanRtMs: number | null
  medianRtMs: number | null
  /** In-set pitches only. */
  perPitch: PitchStat[]
  /** Out-of-set tones: how often "not in my set" was answered correctly. */
  distractors: { n: number; correct: number }
  /** Most frequent wrong answers on in-set pitches, descending. */
  confusions: Confusion[]
  /** 1 point per correct answer, 3 for a correct ⭐ special trial. */
  points: number
}

/** Points earned for one trial. */
export function trialPoints(o: Pick<TrialOutcome, 'correct' | 'special'>): number {
  return o.correct ? (o.special ? 3 : 1) : 0
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2
}

export function summarizeLevel(
  outcomes: readonly TrialOutcome[],
  passAccuracy: number,
): LevelSummary {
  const n = outcomes.length
  const correct = outcomes.filter((o) => o.correct).length
  const accuracy = n ? correct / n : 0

  const rts = outcomes.filter((o) => o.correct && o.rtMs !== null).map((o) => o.rtMs!)
  const meanRtMs = rts.length ? Math.round(rts.reduce((a, b) => a + b, 0) / rts.length) : null

  const byPc = new Map<PitchClass, { n: number; correct: number }>()
  const conf = new Map<string, Confusion>()
  const distractors = { n: 0, correct: 0 }
  for (const o of outcomes) {
    if (o.isDistractor) {
      distractors.n++
      if (o.correct) distractors.correct++
      continue
    }
    const s = byPc.get(o.target) ?? { n: 0, correct: 0 }
    s.n++
    if (o.correct) s.correct++
    byPc.set(o.target, s)
    if (!o.correct && o.response !== 'timeout') {
      const key = `${o.target}>${o.response}`
      const c = conf.get(key) ?? { target: o.target, response: o.response, count: 0 }
      c.count++
      conf.set(key, c)
    }
  }

  return {
    n,
    correct,
    accuracy,
    passed: n > 0 && accuracy >= passAccuracy,
    timeouts: outcomes.filter((o) => o.response === 'timeout').length,
    meanRtMs,
    medianRtMs: median(rts),
    perPitch: [...byPc.entries()]
      .sort(([a], [b]) => a - b)
      .map(([pitchClass, s]) => ({ pitchClass, ...s, accuracy: s.correct / s.n })),
    distractors,
    confusions: [...conf.values()].sort((a, b) => b.count - a.count),
    points: outcomes.reduce((p, o) => p + trialPoints(o), 0),
  }
}
