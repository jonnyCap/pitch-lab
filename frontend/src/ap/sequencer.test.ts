import { describe, expect, it } from 'vitest'
import { mulberry32 } from '@/lib/random'
import { buildLadder, buildTestSpec, DEFAULT_PITCH_ORDER } from './protocol'
import { generateSequence, type Stimulus } from './sequencer'

const wide = () => [21, 108] as const
const ladder = buildLadder({
  pitchOrder: DEFAULT_PITCH_ORDER,
  trainedTimbres: ['piano', 'violin', 'clarinet'],
  deadlineMs: 5000,
})

function counts<T>(xs: readonly T[]): number[] {
  const m = new Map<T, number>()
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1)
  return [...m.values()]
}

function checkInvariants(seq: Stimulus[], spec: { trials: number; pitchSet: readonly number[] }) {
  expect(seq).toHaveLength(spec.trials)
  const inSet = seq.filter((s) => !s.isDistractor)
  for (const s of inSet) expect(spec.pitchSet).toContain(s.pitchClass)
  const c = counts(inSet.map((s) => s.pitchClass))
  expect(c).toHaveLength(spec.pitchSet.length)
  expect(Math.max(...c) - Math.min(...c)).toBeLessThanOrEqual(1)
  for (let i = 1; i < seq.length; i++) expect(seq[i]!.pitchClass).not.toBe(seq[i - 1]!.pitchClass)
}

describe('generateSequence', () => {
  it('satisfies balance + no-repeat for every ladder level over many seeds', () => {
    for (const level of ladder) {
      for (let seed = 1; seed <= 25; seed++) {
        const seq = generateSequence(level, wide, mulberry32(seed * 7919 + level.tier))
        checkInvariants(seq, level)
        if (level.minLeap > 0) {
          for (let i = 1; i < seq.length; i++)
            expect(Math.abs(seq[i]!.midi - seq[i - 1]!.midi)).toBeGreaterThanOrEqual(level.minLeap)
        }
      }
    }
  }, 30_000)

  it('test blocks: consecutive tones always > 1 octave apart, every combination once', () => {
    const spec = buildTestSpec({ trainedTimbre: 'piano', untrainedTimbre: 'harp' })
    for (let seed = 1; seed <= 200; seed++) {
      const seq = generateSequence(spec, wide, mulberry32(seed))
      checkInvariants(seq, spec)
      for (let i = 1; i < seq.length; i++)
        expect(Math.abs(seq[i]!.midi - seq[i - 1]!.midi)).toBeGreaterThan(12)
      expect(new Set(seq.map((s) => `${s.midi}:${s.timbre}`)).size).toBe(96)
    }
  }, 30_000)

  it('balances octaves and timbres within each pitch class', () => {
    const level = ladder.find((l) => l.id === 't3-s7')! // 3 timbres × 3 octaves, 12 trials
    const seq = generateSequence({ ...level, trials: 27 }, wide, mulberry32(3))
    const perCombo = counts(seq.map((s) => `${s.pitchClass}:${s.octave}:${s.timbre}`))
    expect(perCombo).toHaveLength(27)
    expect(new Set(perCombo)).toEqual(new Set([1]))
  })

  it('respects timbre ranges', () => {
    const level = ladder.find((l) => l.id === 't5-s7')!
    const range = (t: string) => (t === 'clarinet' ? ([50, 84] as const) : ([21, 108] as const))
    for (let seed = 1; seed <= 20; seed++) {
      for (const s of generateSequence(level, range, mulberry32(seed))) {
        if (s.timbre === 'clarinet') expect(s.midi).toBeLessThanOrEqual(84)
      }
    }
  })

  it('is deterministic for a given seed', () => {
    const level = ladder[20]!
    expect(generateSequence(level, wide, mulberry32(42))).toEqual(
      generateSequence(level, wide, mulberry32(42)),
    )
  })

  it('throws when a pitch class cannot be played by any timbre', () => {
    const level = ladder[0]!
    expect(() => generateSequence(level, () => [0, 10], mulberry32(1))).toThrow()
  })
})

describe('distractors, weights, partners, special trials', () => {
  const level = ladder.find((l) => l.id === 't6-s3')! // 6 pitches, distractors on
  it('mixes ~15% out-of-set tones, mostly chromatic neighbours of the set', () => {
    let neighbours = 0
    let total = 0
    for (let seed = 1; seed <= 50; seed++) {
      const seq = generateSequence(level, wide, mulberry32(seed))
      const d = seq.filter((s) => s.isDistractor)
      expect(d).toHaveLength(Math.round(level.trials * 0.15))
      for (const s of d) {
        expect(level.pitchSet).not.toContain(s.pitchClass)
        total++
        if (
          level.pitchSet.some(
            (p) => (p + 1) % 12 === s.pitchClass || (p + 11) % 12 === s.pitchClass,
          )
        )
          neighbours++
      }
      // In-set tones stay balanced.
      const c = counts(seq.filter((s) => !s.isDistractor).map((s) => s.pitchClass))
      expect(Math.max(...c) - Math.min(...c)).toBeLessThanOrEqual(1)
      for (let i = 1; i < seq.length; i++)
        expect(seq[i]!.pitchClass).not.toBe(seq[i - 1]!.pitchClass)
    }
    expect(neighbours / total).toBeGreaterThan(0.6)
  })

  it('allocates in proportion to weights', () => {
    const seq = generateSequence(
      {
        pitchSet: [4, 5, 6],
        octaves: [4],
        timbres: ['piano'],
        trials: 30,
        minLeap: 0,
        weights: { 4: 1, 5: 1, 6: 3 },
      },
      wide,
      mulberry32(9),
    )
    expect(seq.filter((s) => s.pitchClass === 6)).toHaveLength(18)
    expect(seq.filter((s) => s.pitchClass === 4)).toHaveLength(6)
  })

  it('plays confusion partners back to back more often', () => {
    const base = {
      pitchSet: [0, 2, 4, 5, 7, 9] as const,
      octaves: [4, 5],
      timbres: ['piano'],
      trials: 30,
      minLeap: 0,
    }
    const adjacent = (seq: Stimulus[]) =>
      seq.slice(1).filter((s, i) => {
        const p = seq[i]!.pitchClass
        return (p === 4 && s.pitchClass === 5) || (p === 5 && s.pitchClass === 4)
      }).length
    let withP = 0
    let without = 0
    for (let seed = 1; seed <= 40; seed++) {
      withP += adjacent(
        generateSequence({ ...base, partners: { 4: [5], 5: [4] } }, wide, mulberry32(seed)),
      )
      without += adjacent(generateSequence(base, wide, mulberry32(seed)))
    }
    expect(withP).toBeGreaterThan(without * 1.5)
  })

  it('marks a few in-set trials as special, never distractors', () => {
    let special = 0
    for (let seed = 1; seed <= 30; seed++) {
      for (const s of generateSequence({ ...level, specialRate: 0.2 }, wide, mulberry32(seed))) {
        if (s.special) {
          special++
          expect(s.isDistractor).toBe(false)
        }
      }
    }
    expect(special).toBeGreaterThan(0)
    expect(generateSequence(level, wide, mulberry32(1)).length).toBe(level.trials)
  })
})
