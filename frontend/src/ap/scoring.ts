/**
 * Per-trial scoring and per-level summaries.
 * A response is correct only if it names the exact pitch class within the
 * deadline — semitone errors are errors (Wong et al. 2020/2025).
 */
import { circularSemitoneError, type PitchClass } from '@/music/pitch'
import type { TrialResponse } from '@/data/db'

export interface ScoredResponse {
  correct: boolean
  semitoneError: number | null
}

export function scoreResponse(
  target: PitchClass,
  response: TrialResponse,
  rtMs: number | null,
  deadlineMs: number | null,
): ScoredResponse {
  if (response === 'timeout' || response === 'none') {
    return { correct: false, semitoneError: null }
  }
  const semitoneError = circularSemitoneError(target, response)
  const inTime = deadlineMs === null || rtMs === null || rtMs <= deadlineMs
  return { correct: semitoneError === 0 && inTime, semitoneError }
}

export interface TrialOutcome {
  target: PitchClass
  response: TrialResponse
  correct: boolean
  semitoneError: number | null
  rtMs: number | null
  timbre: string
  octave: number
}

export interface PitchStat {
  pitchClass: PitchClass
  n: number
  correct: number
  accuracy: number
}

export interface Confusion {
  target: PitchClass
  response: PitchClass
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
  perPitch: PitchStat[]
  /** Most frequent wrong answers, descending. */
  confusions: Confusion[]
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
  for (const o of outcomes) {
    const s = byPc.get(o.target) ?? { n: 0, correct: 0 }
    s.n++
    if (o.correct) s.correct++
    byPc.set(o.target, s)
    if (!o.correct && typeof o.response === 'number') {
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
    confusions: [...conf.values()].sort((a, b) => b.count - a.count),
  }
}
