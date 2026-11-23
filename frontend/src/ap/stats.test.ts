import { describe, expect, it } from 'vitest'
import type { Trial, TrainingSession } from '@/data/db'
import { formatDuration, perPitchAccuracy, totalActiveMs, trainingDays } from './stats'

const t = (pitchClass: Trial['pitchClass'], correct: boolean) => ({ pitchClass, correct }) as Trial
const s = (startedAt: number, activeMs: number) => ({ startedAt, activeMs }) as TrainingSession

describe('stats', () => {
  it('computes per-pitch accuracy sorted by pitch class', () => {
    expect(
      perPitchAccuracy([t(5, true), t(4, false), t(5, false), t(4, true), t(4, true)]),
    ).toEqual([
      { pitchClass: 4, n: 3, accuracy: 2 / 3 },
      { pitchClass: 5, n: 2, accuracy: 0.5 },
    ])
  })
  it('sums active time and counts training days', () => {
    const day = 86_400_000
    const base = new Date(2026, 10, 2, 9).getTime()
    const ss = [s(base, 600_000), s(base + 3600_000, 300_000), s(base + day, 1_200_000)]
    expect(totalActiveMs(ss)).toBe(2_100_000)
    expect(trainingDays(ss)).toBe(2)
  })
  it('formats durations', () => {
    expect(formatDuration(25 * 60000)).toBe('25 min')
    expect(formatDuration(135 * 60000)).toBe('2 h 15 min')
  })
})
