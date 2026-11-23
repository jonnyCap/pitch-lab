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
  for (const s of seq) expect(spec.pitchSet).toContain(s.pitchClass)
  const c = counts(seq.map((s) => s.pitchClass))
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
