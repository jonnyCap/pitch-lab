import { describe, expect, it } from 'vitest'
import { buildLadder, DEFAULT_PITCH_ORDER } from './protocol'
import { applyLevelResult, initialProgress, pitchesMastered, type APProgress } from './progress'

const ladder = buildLadder({
  pitchOrder: DEFAULT_PITCH_ORDER,
  trainedTimbres: ['piano'],
  deadlineMs: 5000,
})
const at = (id: string, p: Partial<APProgress> = {}): APProgress => ({
  ...initialProgress(),
  levelIndex: ladder.findIndex((l) => l.id === id),
  ...p,
})

describe('applyLevelResult', () => {
  it('advances on pass and records passes/attempts', () => {
    const { progress, transition } = applyLevelResult(at('t3-s1'), ladder, true)
    expect(transition).toBe('advance')
    expect(ladder[progress.levelIndex]!.id).toBe('t3-s2')
    expect(progress.passes['t3-s1']).toBe(1)
    expect(progress.attempts['t3-s1']).toBe(1)
    expect(progress.bestIndex).toBe(1)
  })

  it('repeats a failed feedback step', () => {
    const { progress, transition } = applyLevelResult(at('t3-s3'), ladder, false)
    expect(transition).toBe('repeat')
    expect(ladder[progress.levelIndex]!.id).toBe('t3-s3')
  })

  it('falls back to the feedback step after 3 failed no-feedback attempts', () => {
    let p = at('t4-s6')
    let r = applyLevelResult(p, ladder, false)
    expect(r.transition).toBe('repeat')
    r = applyLevelResult(r.progress, ladder, false)
    expect(r.transition).toBe('repeat')
    r = applyLevelResult(r.progress, ladder, false)
    expect(r.transition).toBe('fallback')
    expect(ladder[r.progress.levelIndex]!.id).toBe('t4-s5')
    expect(r.progress.failStreak).toBe(0)
    p = r.progress
    expect(p.attempts['t4-s6']).toBe(3)
  })

  it('resets the fail streak on a pass', () => {
    const r = applyLevelResult(at('t4-s6', { failStreak: 2 }), ladder, true)
    expect(r.progress.failStreak).toBe(0)
    expect(ladder[r.progress.levelIndex]!.id).toBe('t4-s7')
  })

  it('moves to the next tier after step 8 and completes after the last level', () => {
    expect(ladder[applyLevelResult(at('t3-s8'), ladder, true).progress.levelIndex]!.id).toBe(
      't4-s1',
    )
    expect(applyLevelResult(at('t12-s8'), ladder, true).transition).toBe('complete')
  })

  it('does not mutate its input', () => {
    const p = at('t3-s1')
    const snapshot = JSON.stringify(p)
    applyLevelResult(p, ladder, true)
    expect(JSON.stringify(p)).toBe(snapshot)
  })
})

describe('pitchesMastered', () => {
  it('is the largest tier whose final step was passed', () => {
    expect(pitchesMastered(initialProgress(), ladder)).toBe(0)
    expect(
      pitchesMastered(
        { ...initialProgress(), passes: { 't3-s8': 1, 't4-s8': 1, 't5-s3': 2 } },
        ladder,
      ),
    ).toBe(4)
  })
})
