import { describe, expect, it } from 'vitest'
import { buildLadder, DEFAULT_PITCH_ORDER } from './protocol'
import { MASTERY_GAP_MS } from './protocol'
import {
  applyLevelResult,
  canStart,
  completeDrill,
  initialProgress,
  normalizeProgress,
  pitchesMastered,
  type APProgress,
} from './progress'

const ladder = buildLadder({
  pitchOrder: DEFAULT_PITCH_ORDER,
  trainedTimbres: ['piano'],
  deadlineMs: 5000,
})
const pass = { passed: true, points: 10, now: 1_000 }
const fail = { passed: false, points: 2, now: 1_000 }
const at = (id: string, p: Partial<APProgress> = {}): APProgress => ({
  ...initialProgress(),
  levelIndex: ladder.findIndex((l) => l.id === id),
  ...p,
})

describe('applyLevelResult', () => {
  it('advances on pass and records passes/attempts', () => {
    const { progress, transition } = applyLevelResult(at('t3-s1'), ladder, pass)
    expect(transition).toBe('advance')
    expect(ladder[progress.levelIndex]!.id).toBe('t3-s2')
    expect(progress.passes['t3-s1']).toBe(1)
    expect(progress.attempts['t3-s1']).toBe(1)
    expect(progress.bestIndex).toBe(1)
  })

  it('repeats a failed feedback step', () => {
    const { progress, transition } = applyLevelResult(at('t3-s3'), ladder, fail)
    expect(transition).toBe('repeat')
    expect(ladder[progress.levelIndex]!.id).toBe('t3-s3')
  })

  it('falls back to the feedback step after 3 failed no-feedback attempts', () => {
    let p = at('t4-s6')
    let r = applyLevelResult(p, ladder, fail)
    expect(r.transition).toBe('repeat')
    r = applyLevelResult(r.progress, ladder, fail)
    expect(r.transition).toBe('repeat')
    r = applyLevelResult(r.progress, ladder, fail)
    expect(r.transition).toBe('fallback')
    expect(ladder[r.progress.levelIndex]!.id).toBe('t4-s5')
    expect(r.progress.failStreak).toBe(0)
    p = r.progress
    expect(p.attempts['t4-s6']).toBe(3)
  })

  it('resets the fail streak on a pass', () => {
    const r = applyLevelResult(at('t4-s6', { failStreak: 2 }), ladder, pass)
    expect(r.progress.failStreak).toBe(0)
    expect(ladder[r.progress.levelIndex]!.id).toBe('t4-s7')
  })

  it('moves to the next tier after step 8 and completes after the last level', () => {
    expect(ladder[applyLevelResult(at('t3-s8'), ladder, pass).progress.levelIndex]!.id).toBe(
      't4-s1',
    )
    const r = applyLevelResult(at('t12-s8'), ladder, pass)
    expect(r.transition).toBe('advance')
    expect(ladder[r.progress.levelIndex]!.id).toBe('sp1-s1')
  })

  it('does not mutate its input', () => {
    const p = at('t3-s1')
    const snapshot = JSON.stringify(p)
    applyLevelResult(p, ladder, pass)
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

describe('mastery level', () => {
  const finalIdx = ladder.findIndex((l) => l.final)
  const H = 60 * 60 * 1000

  it('needs 4 passes; the 4th at least 12 h after the 3rd', () => {
    let p = at('sp3-s2')
    const t0 = 1_000_000
    for (let i = 0; i < 3; i++) {
      expect(canStart(p, ladder[finalIdx]!, t0 + i * H)).toEqual({ ok: true })
      const r = applyLevelResult(p, ladder, { passed: true, points: 30, now: t0 + i * H })
      expect(r.transition).toBe('mastery-pass')
      expect(r.progress.levelIndex).toBe(finalIdx)
      p = r.progress
    }
    expect(p.finalPasses).toHaveLength(3)
    const third = t0 + 2 * H
    expect(canStart(p, ladder[finalIdx]!, third + 11 * H)).toEqual({
      ok: false,
      until: third + MASTERY_GAP_MS,
    })
    expect(canStart(p, ladder[finalIdx]!, third + MASTERY_GAP_MS)).toEqual({ ok: true })

    const r = applyLevelResult(p, ladder, { passed: true, points: 30, now: third + 13 * H })
    expect(r.transition).toBe('complete')
    expect(r.progress.masteredAt).toBe(third + 13 * H)
    expect(r.progress.levelIndex).toBe(ladder.length)
  })

  it('keeps earlier mastery passes after a failed attempt; repeated failures fall back to the feedback step', () => {
    let p = at('sp3-s2', { finalPasses: [1, 2] })
    for (let i = 0; i < 3; i++) p = applyLevelResult(p, ladder, fail).progress
    expect(ladder[p.levelIndex]!.id).toBe('sp3-s1')
    expect(p.finalPasses).toEqual([1, 2])
  })
})

describe('focus drills and points', () => {
  it('schedules a drill after 10 passes once the set has ≥ 5 pitches', () => {
    let p = at('t5-s1')
    for (let i = 0; i < 9; i++) p = applyLevelResult(p, ladder, pass).progress
    expect(p.drillDue).toBe(false)
    p = applyLevelResult(p, ladder, pass).progress
    expect(p.drillDue).toBe(true)
    expect(p.passesSinceDrill).toBe(0)
    const done = completeDrill(p, 15)
    expect(done.drillDue).toBe(false)
    expect(done.points).toBe(p.points + 15)
  })

  it('does not schedule drills with fewer than 5 pitches', () => {
    let p = at('t3-s1')
    for (let i = 0; i < 12; i++) p = applyLevelResult(p, ladder, pass).progress
    expect(ladder[p.levelIndex - 1]!.tier).toBeLessThan(5)
    expect(p.drillDue).toBe(false)
  })

  it('accumulates points on passes and failures', () => {
    const p1 = applyLevelResult(at('t3-s1'), ladder, pass).progress
    const p2 = applyLevelResult(p1, ladder, fail).progress
    expect(p2.points).toBe(12)
  })
})

describe('normalizeProgress', () => {
  it('fills fields missing in documents saved by older versions', () => {
    const old = {
      schema: 1 as const,
      levelIndex: 7,
      failStreak: 1,
      passes: { 't3-s1': 1 },
      attempts: {},
      onboardingDone: true,
      bestIndex: 7,
    }
    const p = normalizeProgress(old as Partial<APProgress>)
    expect(p.levelIndex).toBe(7)
    expect(p.finalPasses).toEqual([])
    expect(p.points).toBe(0)
    expect(p.drillDue).toBe(false)
  })
  it('resets unknown schemas', () => {
    expect(normalizeProgress(undefined)).toEqual(initialProgress())
    expect(normalizeProgress({ schema: 2 } as unknown as APProgress)).toEqual(initialProgress())
  })
})
