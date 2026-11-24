/**
 * Adaptive practice from the learner's recent answers (feedback steps only;
 * no-feedback steps and tests stay balanced so scores remain comparable).
 *
 * - weights: pitches answered wrongly more often are sampled more often
 *   (smoothed error rate, so a pitch with few data points is not over-weighted;
 *   max ≈ 3× the weight of a perfectly known pitch).
 * - partners: the pitches each pitch is most often confused with, in either
 *   direction; the sequencer then likes to play such pairs back to back
 *   (contrast training; cf. interleaving of similar categories).
 * - weakest pitch: target of the compulsory focus drill (Wong et al. 2020, Exp. 3).
 */
import type { PitchClass } from '@/music/pitch'
import type { Trial } from '@/data/db'

/** Minimum confusions before a pair counts as "confused". */
const MIN_CONFUSIONS = 2
const MAX_PARTNERS = 2

type Answer = Pick<Trial, 'pitchClass' | 'response' | 'correct' | 'isDistractor'>

function inSet(trials: readonly Answer[], set: readonly PitchClass[]): Answer[] {
  return trials.filter((t) => !t.isDistractor && set.includes(t.pitchClass))
}

/** Smoothed error rate per pitch: (errors + 1) / (n + 2). */
export function errorRates(
  trials: readonly Answer[],
  set: readonly PitchClass[],
): Record<number, number> {
  const stats = new Map<PitchClass, { n: number; err: number }>(
    set.map((pc) => [pc, { n: 0, err: 0 }]),
  )
  for (const t of inSet(trials, set)) {
    const s = stats.get(t.pitchClass)!
    s.n++
    if (!t.correct) s.err++
  }
  return Object.fromEntries([...stats].map(([pc, s]) => [pc, (s.err + 1) / (s.n + 2)]))
}

export function adaptiveWeights(
  trials: readonly Answer[],
  set: readonly PitchClass[],
): Partial<Record<PitchClass, number>> {
  const rates = errorRates(trials, set)
  return Object.fromEntries(set.map((pc) => [pc, 1 + 2 * rates[pc]!]))
}

export function confusionPartners(
  trials: readonly Answer[],
  set: readonly PitchClass[],
): Partial<Record<PitchClass, PitchClass[]>> {
  const pair = new Map<string, number>()
  for (const t of inSet(trials, set)) {
    if (t.correct || typeof t.response !== 'number' || !set.includes(t.response)) continue
    const [a, b] = [t.pitchClass, t.response].sort((x, y) => x - y)
    const key = `${a}-${b}`
    pair.set(key, (pair.get(key) ?? 0) + 1)
  }
  const out: Partial<Record<PitchClass, { pc: PitchClass; n: number }[]>> = {}
  for (const [key, n] of pair) {
    if (n < MIN_CONFUSIONS) continue
    const [a, b] = key.split('-').map(Number) as [PitchClass, PitchClass]
    ;(out[a] ??= []).push({ pc: b, n })
    ;(out[b] ??= []).push({ pc: a, n })
  }
  return Object.fromEntries(
    Object.entries(out).map(([pc, list]) => [
      pc,
      list!
        .sort((x, y) => y.n - x.n)
        .slice(0, MAX_PARTNERS)
        .map((x) => x.pc),
    ]),
  )
}

/** The pitch with the highest smoothed error rate (ties: the one seen most often). */
export function weakestPitch(trials: readonly Answer[], set: readonly PitchClass[]): PitchClass {
  const rates = errorRates(trials, set)
  const counts = new Map<PitchClass, number>()
  for (const t of inSet(trials, set)) counts.set(t.pitchClass, (counts.get(t.pitchClass) ?? 0) + 1)
  return [...set].sort(
    (a, b) => rates[b]! - rates[a]! || (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || a - b,
  )[0]!
}

/**
 * Drill weights: the focus pitch takes about half the trials; its confusion partners
 * (or, without data, its chromatic neighbours in the set) share most of the rest.
 */
export function drillWeights(
  focus: PitchClass,
  partners: readonly PitchClass[],
  set: readonly PitchClass[],
): Partial<Record<PitchClass, number>> {
  const others = set.filter((pc) => pc !== focus)
  const near =
    partners.length > 0
      ? partners.filter((p) => others.includes(p))
      : others.filter((pc) => Math.min((pc - focus + 12) % 12, (focus - pc + 12) % 12) <= 2)
  const w: Partial<Record<PitchClass, number>> = { [focus]: others.length }
  for (const pc of others) w[pc] = near.includes(pc) ? 3 : 1
  // Focus ≈ 47% of trials (just under half keeps the no-repeat ordering flexible).
  w[focus] = 0.9 * others.reduce<number>((s, pc) => s + w[pc]!, 0)
  return w
}
