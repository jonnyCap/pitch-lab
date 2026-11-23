import { describe, expect, it } from 'vitest'
import type { PitchClass } from '@/music/pitch'
import { testMetrics } from './assessment'
import { scoreResponse, type TrialOutcome } from './scoring'

const o = (
  target: PitchClass,
  response: PitchClass | 'timeout',
  timbre: string,
  octave: number,
  rtMs = 2000,
): TrialOutcome => ({
  target,
  response,
  timbre,
  octave,
  rtMs: response === 'timeout' ? null : rtMs,
  ...scoreResponse(target, response, rtMs, 5000),
})

describe('testMetrics', () => {
  const outcomes = [
    o(0, 0, 'piano', 4, 1000), // correct
    o(0, 1, 'piano', 4, 2000), // 1 semitone
    o(2, 8, 'harp', 4, 3000), // 6 semitones
    o(5, 'timeout', 'piano', 3),
  ]
  const m = testMetrics(outcomes, { trainedTimbres: ['piano'], trainedOctaves: [4, 5, 6] })

  it('computes overall metrics against hand-computed values', () => {
    expect(m.n).toBe(4)
    expect(m.accuracy).toBe(0.25)
    expect(m.accuracyWithin1).toBe(0.5)
    expect(m.mad).toBeCloseTo(7 / 3, 10)
    expect(m.medianRtMs).toBe(2000)
    expect(m.timeouts).toBe(1)
    expect(m.vanHedgerIndex).toBeCloseTo((7 / 3 + 10) * Math.log(2), 10)
  })

  it('splits trained vs untrained conditions', () => {
    expect(m.trained.n).toBe(2) // piano, octave 4
    expect(m.trained.accuracy).toBe(0.5)
    expect(m.untrained.n).toBe(2) // harp, or octave 3
    expect(m.byTimbre['harp']!.mad).toBe(6)
    expect(m.byOctave['3']!.mad).toBeNull()
  })
})
