import { describe, expect, it } from 'vitest'
import type { PitchClass } from '@/music/pitch'
import { median, scoreResponse, summarizeLevel, type TrialOutcome } from './scoring'

const o = (target: PitchClass, response: TrialOutcome['response'], rtMs = 1000): TrialOutcome => {
  const s = scoreResponse(target, response, rtMs, 5000)
  return {
    target,
    response,
    rtMs: response === 'timeout' ? null : rtMs,
    timbre: 'piano',
    octave: 4,
    ...s,
  }
}

describe('scoreResponse', () => {
  it('counts semitone errors as wrong', () => {
    expect(scoreResponse(4, 4, 800, 5000)).toEqual({ correct: true, semitoneError: 0 })
    expect(scoreResponse(4, 5, 800, 5000)).toEqual({ correct: false, semitoneError: 1 })
    expect(scoreResponse(0, 11, 800, 5000)).toEqual({ correct: false, semitoneError: 1 })
  })
  it('treats timeouts and late answers as wrong', () => {
    expect(scoreResponse(4, 'timeout', null, 5000)).toEqual({ correct: false, semitoneError: null })
    expect(scoreResponse(4, 4, 5001, 5000).correct).toBe(false)
  })
})

describe('summarizeLevel', () => {
  it('computes accuracy, pass, per-pitch stats and confusions', () => {
    const outcomes = [
      ...Array.from({ length: 9 }, () => o(4, 4, 900)),
      o(5, 6, 1200),
      o(5, 5, 700),
      o(5, 6, 1100),
      o(6, 'timeout'),
    ]
    const s = summarizeLevel(outcomes, 0.9)
    expect(s.n).toBe(13)
    expect(s.correct).toBe(10)
    expect(s.passed).toBe(false)
    expect(s.timeouts).toBe(1)
    expect(s.perPitch.map((p) => [p.pitchClass, p.n, p.correct])).toEqual([
      [4, 9, 9],
      [5, 3, 1],
      [6, 1, 0],
    ])
    expect(s.confusions[0]).toEqual({ target: 5, response: 6, count: 2 })
    expect(s.meanRtMs).toBe(880)
  })

  it('passes at exactly 90%', () => {
    const outcomes = [...Array.from({ length: 9 }, () => o(4, 4)), o(5, 6)]
    expect(summarizeLevel(outcomes, 0.9).passed).toBe(true)
  })

  it('median', () => {
    expect(median([])).toBeNull()
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 2, 3])).toBe(2.5)
  })
})
