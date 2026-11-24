/**
 * Implicit pitch-memory check (after Van Hedger, Heald & Nusbaum 2019, "INM"):
 * a 200 ms sine target is followed by a 1 s noise mask; the learner then moves
 * a comparison tone in 10-cent steps until it matches the remembered target.
 * Targets lie between 471.58 and 547.99 Hz (27 tones, 10 cents apart, as in the
 * study). The mean absolute error is an indicator of pitch-memory precision —
 * in the study, people with genuine AP averaged ≈ 24 cents and the six trainees
 * ≈ 27 cents. It is used to set expectations only, never to gate training.
 */
import { randInt, shuffle, type Rng } from '@/lib/random'

export const PM_BASE_HZ = 471.58
export const PM_TONES = 27
export const PM_STEP_CENTS = 10
export const PM_TRIALS = 12
export const PM_TARGET_MS = 200
export const PM_MASK_MS = 1000
/** Comparison tone starts this far (± cents) from the target. */
export const PM_START_OFFSETS = [-80, -40, 40, 80] as const

export interface PitchMemoryTrial {
  targetHz: number
  startCents: number
}

export function centsToHz(baseHz: number, cents: number): number {
  return baseHz * Math.pow(2, cents / 1200)
}

export function generatePitchMemoryTrials(rng: Rng, n = PM_TRIALS): PitchMemoryTrial[] {
  const targets = shuffle(
    rng,
    Array.from({ length: PM_TONES }, (_, i) => i),
  ).slice(0, n)
  return targets.map((i) => ({
    targetHz: centsToHz(PM_BASE_HZ, i * PM_STEP_CENTS),
    startCents: PM_START_OFFSETS[randInt(rng, 0, PM_START_OFFSETS.length)]!,
  }))
}

export interface PitchMemoryResult {
  trials: number
  /** Mean absolute matching error in cents. */
  meanAbsCents: number
  /** Mean signed error (positive = matched too high). */
  meanSignedCents: number
}

export function summarizePitchMemory(errorsCents: readonly number[]): PitchMemoryResult {
  const n = errorsCents.length
  return {
    trials: n,
    meanAbsCents: n ? errorsCents.reduce((s, e) => s + Math.abs(e), 0) / n : 0,
    meanSignedCents: n ? errorsCents.reduce((s, e) => s + e, 0) / n : 0,
  }
}

export type PitchMemoryBand = 'very-precise' | 'good' | 'typical'

export function pitchMemoryBand(meanAbsCents: number): PitchMemoryBand {
  if (meanAbsCents <= 30) return 'very-precise'
  if (meanAbsCents <= 60) return 'good'
  return 'typical'
}
