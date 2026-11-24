import { describe, expect, it } from 'vitest'
import type { Trial } from '@/data/db'
import type { PitchClass } from '@/music/pitch'
import { mulberry32 } from '@/lib/random'
import {
  adaptiveWeights,
  confusionPartners,
  drillWeights,
  errorRates,
  weakestPitch,
} from './adaptive'
import { generateSequence } from './sequencer'

const a = (pitchClass: PitchClass, response: Trial['response'], isDistractor = false) =>
  ({
    pitchClass,
    response,
    correct: !isDistractor && response === pitchClass,
    isDistractor,
  }) as Trial

const set: PitchClass[] = [3, 4, 5, 6, 7]
// F (5) is often answered as F♯ (6) and vice versa; E (4) is perfect.
const history = [
  ...Array.from({ length: 10 }, () => a(4, 4)),
  a(5, 6),
  a(5, 6),
  a(5, 6),
  a(5, 5),
  a(6, 5),
  a(6, 5),
  a(6, 6),
  a(3, 3),
  a(3, 4),
  a(7, 7),
  a(8, 7, true), // distractors are ignored
]

describe('adaptive', () => {
  it('smoothed error rates', () => {
    const r = errorRates(history, set)
    expect(r[4]).toBeCloseTo(1 / 12)
    expect(r[5]).toBeCloseTo(4 / 6)
    expect(r[7]).toBeCloseTo(1 / 3)
  })

  it('weights confused pitches more (1×–3×)', () => {
    const w = adaptiveWeights(history, set)
    expect(w[5]!).toBeGreaterThan(w[3]!)
    expect(w[3]!).toBeGreaterThan(w[4]!)
    for (const pc of set) {
      expect(w[pc]!).toBeGreaterThanOrEqual(1)
      expect(w[pc]!).toBeLessThanOrEqual(3)
    }
  })

  it('finds confusion partners in both directions (≥ 2 confusions)', () => {
    expect(confusionPartners(history, set)).toEqual({ 5: [6], 6: [5] })
  })

  it('weakest pitch', () => {
    expect(weakestPitch(history, set)).toBe(5)
    expect(weakestPitch([], set)).toBe(3) // no data: lowest pitch class, deterministic
  })

  it('drill weights give the focus pitch about half of the trials', () => {
    const w = drillWeights(5, [6], set)
    const seq = generateSequence(
      { pitchSet: set, octaves: [4], timbres: ['piano'], trials: 20, minLeap: 0, weights: w },
      () => [21, 108],
      mulberry32(5),
    )
    const focus = seq.filter((s) => s.pitchClass === 5).length
    expect(focus).toBeGreaterThanOrEqual(8)
    expect(focus).toBeLessThanOrEqual(10)
    expect(seq.filter((s) => s.pitchClass === 6).length).toBeGreaterThan(
      seq.filter((s) => s.pitchClass === 3).length,
    )
    for (let i = 1; i < seq.length; i++) expect(seq[i]!.pitchClass).not.toBe(seq[i - 1]!.pitchClass)
  })
})
