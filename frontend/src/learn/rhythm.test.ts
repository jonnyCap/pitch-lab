import { describe, expect, it } from 'vitest'
import { mulberry32 } from '@/lib/random'
import {
  calibrateLatency,
  generatePattern,
  NOTE_VALUE_ORDER,
  NOTE_VALUES,
  noteOnsets,
  RHYTHM_LEVELS,
  scoreTaps,
} from './rhythm'

describe('rhythm patterns', () => {
  it('every bar has exactly 4 beats; first event is a note; only level-appropriate values', () => {
    const allowed: Record<number, string[]> = {
      1: ['q', 'h', 'qr'],
      2: ['q', 'h', 'qr', '8'],
      3: ['q', 'h', 'qr', '8', 'qd', '8r', 'hd'],
      4: ['q', '8', '16', 'qd'],
    }
    for (const level of RHYTHM_LEVELS) {
      for (let s = 1; s <= 100; s++) {
        const bars = generatePattern(level, mulberry32(s * 3 + level))
        expect(bars).toHaveLength(2)
        for (const bar of bars) expect(bar.reduce((t, e) => t + e.beats, 0)).toBe(4)
        expect(bars[0]![0]!.rest).toBe(false)
        for (const e of bars.flat()) expect(allowed[level]).toContain(e.code)
      }
    }
  })
  it('note onsets skip rests', () => {
    const bars = [
      [
        { code: 'q', beats: 1, rest: false },
        { code: 'qr', beats: 1, rest: true },
        { code: '8', beats: 0.5, rest: false },
        { code: '8', beats: 0.5, rest: false },
        { code: 'q', beats: 1, rest: false },
      ],
    ]
    expect(noteOnsets(bars)).toEqual([0, 2, 2.5, 3])
  })
  it('note value catalogue matches teaching order', () => {
    expect([...NOTE_VALUE_ORDER].sort()).toEqual(NOTE_VALUES.map((v) => v.id).sort())
  })
})

describe('tap scoring', () => {
  const expected = [0, 500, 1000, 1250, 1500]
  it('perfect taps score 1', () => {
    const r = scoreTaps(expected, [5, 495, 1010, 1240, 1500])
    expect(r.score).toBe(1)
    expect(r.hits).toBe(5)
    expect(r.meanAbsErrorMs).toBeCloseTo(6, 5)
  })
  it('timing errors lose credit linearly; misses and extras cost', () => {
    // window = min(180, 250/2) = 125ms. 82.5ms error → half credit.
    const late = scoreTaps(expected, [0, 582.5, 1000, 1250, 1500])
    expect(late.score).toBeCloseTo((4 + 0.5) / 5, 5)
    const missed = scoreTaps(expected, [0, 500, 1000, 1500])
    expect(missed.misses).toBe(1)
    expect(missed.score).toBeCloseTo(4 / 5, 5)
    expect(missed.perNote[3]).toBeNull()
    const extra = scoreTaps(expected, [0, 250, 500, 1000, 1250, 1500])
    expect(extra.extras).toBe(1)
    expect(extra.score).toBeCloseTo((5 - 0.5) / 5, 5)
    expect(scoreTaps(expected, []).score).toBe(0)
  })
  it('reports early/late tendency', () => {
    const r = scoreTaps(
      expected,
      expected.map((t) => t - 30),
    )
    expect(r.meanErrorMs).toBeCloseTo(-30, 5)
  })
  it('calibration uses the median offset and ignores outliers', () => {
    const clicks = [0, 750, 1500, 2250, 3000, 3750]
    expect(calibrateLatency(clicks, [60, 820, 1550, 2320, 3060, 3000 + 2000])).toBe(60)
    expect(calibrateLatency(clicks, [60, 820])).toBeNull()
  })
})

import { applyRhythmResult, initialRhythmProgress, normalizeRhythmProgress } from './rhythm'

describe('rhythm progress', () => {
  it('advances after 3 passing patterns, keeps best scores', () => {
    let p = initialRhythmProgress()
    p = applyRhythmResult(p, 0.7).progress
    expect(p.passes).toBe(0)
    expect(p.best[1]).toBe(0.7)
    p = applyRhythmResult(p, 0.9).progress
    p = applyRhythmResult(p, 0.86).progress
    const r = applyRhythmResult(p, 0.95)
    expect(r.levelUp).toBe(true)
    expect(r.progress).toMatchObject({ level: 2, passes: 0 })
    expect(r.progress.best[1]).toBe(0.95)
  })
  it('stays at the last level', () => {
    let p = { ...initialRhythmProgress(), level: 4, passes: 2 }
    const r = applyRhythmResult(p, 1)
    expect(r.levelUp).toBe(false)
    p = r.progress
    expect(p.level).toBe(4)
  })
  it('normalizes old/missing docs', () => {
    expect(normalizeRhythmProgress(undefined).level).toBe(1)
    expect(normalizeRhythmProgress({ schema: 1, level: 3 } as never).bpm).toBe(80)
  })
})
