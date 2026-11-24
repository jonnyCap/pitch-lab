/**
 * Metrics for absolute-pitch tests (pretest, weekly, retention).
 *
 * - accuracy: exact pitch class (semitone errors are wrong; UCSD/Wong convention)
 * - accuracyWithin1: counting ±1 semitone as correct (UCSF-style partial credit view)
 * - mad: mean circular semitone error over answered trials (0 = perfect, ≈3 = chance)
 * - medianRtMs over answered trials
 * - splits by timbre and octave, and trained vs. untrained conditions
 * - vanHedgerIndex: (MAD + 10) · ln(median RT in s) — lower is better
 *   (Van Hedger et al. 2019 used this to compare against AP-possessor norms; indicative only)
 */
import { median, type TrialOutcome } from './scoring'

export interface ConditionMetrics {
  n: number
  accuracy: number
  accuracyWithin1: number
  mad: number | null
  medianRtMs: number | null
}

export interface TestMetrics extends ConditionMetrics {
  timeouts: number
  vanHedgerIndex: number | null
  byTimbre: Record<string, ConditionMetrics>
  byOctave: Record<string, ConditionMetrics>
  trained: ConditionMetrics
  untrained: ConditionMetrics
}

export function conditionMetrics(outcomes: readonly TrialOutcome[]): ConditionMetrics {
  const n = outcomes.length
  const answered = outcomes.filter((o) => o.semitoneError !== null)
  const errors = answered.map((o) => o.semitoneError!)
  const rts = answered.filter((o) => o.rtMs !== null).map((o) => o.rtMs!)
  return {
    n,
    accuracy: n ? outcomes.filter((o) => o.correct).length / n : 0,
    accuracyWithin1: n ? errors.filter((e) => e <= 1).length / n : 0,
    mad: errors.length ? errors.reduce((a, b) => a + b, 0) / errors.length : null,
    medianRtMs: median(rts),
  }
}

export interface TrainedConditions {
  trainedTimbres: readonly string[]
  trainedOctaves: readonly number[]
}

export function testMetrics(
  outcomes: readonly TrialOutcome[],
  trainedConditions: TrainedConditions,
): TestMetrics {
  const all = conditionMetrics(outcomes)
  const group = (key: (o: TrialOutcome) => string) => {
    const m = new Map<string, TrialOutcome[]>()
    for (const o of outcomes) m.set(key(o), [...(m.get(key(o)) ?? []), o])
    return Object.fromEntries([...m.entries()].map(([k, v]) => [k, conditionMetrics(v)]))
  }
  const isTrained = (o: TrialOutcome) =>
    trainedConditions.trainedTimbres.includes(o.timbre) &&
    trainedConditions.trainedOctaves.includes(o.octave)

  return {
    ...all,
    timeouts: outcomes.filter((o) => o.response === 'timeout').length,
    vanHedgerIndex:
      all.mad !== null && all.medianRtMs !== null && all.medianRtMs > 0
        ? (all.mad + 10) * Math.log(all.medianRtMs / 1000)
        : null,
    byTimbre: group((o) => o.timbre),
    byOctave: group((o) => String(o.octave)),
    trained: conditionMetrics(outcomes.filter(isTrained)),
    untrained: conditionMetrics(outcomes.filter((o) => !isTrained(o))),
  }
}

export type APBand = 'non-ap' | 'emerging' | 'near-ap' | 'ap-level'

export const AP_BAND_LABELS: Record<APBand, string> = {
  'non-ap': 'Starting out',
  emerging: 'Emerging',
  'near-ap': 'Near absolute pitch',
  'ap-level': 'Absolute-pitch level',
}

/**
 * Indicative classification of a test result (not a diagnosis):
 * - ap-level: ≥ 90% exact overall, ≥ 85% exact on untrained conditions, median RT ≤ 2 s
 *   (fast and accurate, generalising beyond the trained instrument/octaves);
 * - near-ap: ≥ 85% exact (the UCSD-test threshold, semitone errors counted as wrong);
 * - emerging: clearly above chance — ≥ 30% exact or mean error ≤ 1.5 semitones
 *   (chance: ≈ 8% and 3.0);
 * - non-ap otherwise.
 */
export function classify(m: TestMetrics): APBand {
  if (
    m.accuracy >= 0.9 &&
    m.untrained.n > 0 &&
    m.untrained.accuracy >= 0.85 &&
    m.medianRtMs !== null &&
    m.medianRtMs <= 2000
  ) {
    return 'ap-level'
  }
  if (m.accuracy >= 0.85) return 'near-ap'
  if (m.accuracy >= 0.3 || (m.mad !== null && m.mad <= 1.5)) return 'emerging'
  return 'non-ap'
}
