import { describe, expect, it } from 'vitest'
import { buildLadder, buildTestSpec, DEFAULT_PITCH_ORDER, trialsForSetSize } from './protocol'

const ladder = buildLadder({
  pitchOrder: DEFAULT_PITCH_ORDER,
  trainedTimbres: ['piano', 'violin', 'clarinet'],
  deadlineMs: 5000,
})

describe('protocol ladder', () => {
  it('has 10 tiers × 8 steps = 80 levels with unique ids', () => {
    expect(ladder).toHaveLength(80)
    expect(new Set(ladder.map((l) => l.id)).size).toBe(80)
    expect(ladder[0]!.id).toBe('t3-s1')
    expect(ladder[79]!.id).toBe('t12-s8')
  })

  it('pitch order contains every pitch class once, starting E F F♯', () => {
    expect([...DEFAULT_PITCH_ORDER].sort((a, b) => a - b)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
    ])
    expect(DEFAULT_PITCH_ORDER.slice(0, 3)).toEqual([4, 5, 6])
  })

  it('grows the set by one pitch per tier', () => {
    for (const l of ladder) expect(l.pitchSet).toHaveLength(l.tier)
    expect(ladder.find((l) => l.id === 't4-s1')!.pitchSet).toEqual([4, 5, 6, 7])
  })

  it('alternates feedback / no-feedback and adds interference before no-feedback steps', () => {
    for (const l of ladder) {
      expect(l.feedback).toBe(l.step % 2 === 1)
      expect(l.interference).toBe(l.feedback ? null : 'shepard')
      expect(l.betweenTrials).toBe(l.feedback ? 'silence' : 'noise')
      expect(l.passAccuracy).toBe(0.9)
    }
  })

  it('ramps octaves and timbres within a tier', () => {
    const t = ladder.filter((l) => l.tier === 5)
    expect(t.map((l) => l.octaves.length)).toEqual([1, 1, 2, 2, 1, 1, 3, 3])
    expect(t.map((l) => l.timbres.length)).toEqual([1, 1, 1, 1, 3, 3, 3, 3])
    expect(t[0]!.timbres).toEqual(['piano'])
  })

  it('uses Wong Exp. 3 trial counts', () => {
    expect(trialsForSetSize(3)).toBe(12)
    expect(trialsForSetSize(7)).toBe(20)
    expect(trialsForSetSize(12)).toBe(30)
  })

  it('works with a single trained timbre', () => {
    const l = buildLadder({
      pitchOrder: DEFAULT_PITCH_ORDER,
      trainedTimbres: ['complex'],
      deadlineMs: 5000,
    })
    expect(l[6]!.timbres).toEqual(['complex'])
  })
})

describe('test spec', () => {
  it('covers 12 pitch classes × 4 octaves × 2 timbres without feedback', () => {
    const t = buildTestSpec({ trainedTimbre: 'piano', untrainedTimbre: 'harp' })
    expect(t.trials).toBe(96)
    expect(t.feedback).toBe(false)
    expect(t.minLeap).toBe(13)
    expect(t.responseOptions).toHaveLength(12)
  })
})
