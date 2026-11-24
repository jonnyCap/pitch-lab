import { describe, expect, it } from 'vitest'
import type { TrainingSession } from '@/data/db'
import { dailySeries, minutesLast7Days, minutesOn, streakDays } from './engagement'
import { DAY_MS } from './schedule'

const now = new Date(2026, 10, 24, 18).getTime()
const s = (daysAgo: number, minutes: number) =>
  ({ startedAt: now - daysAgo * DAY_MS - 3_600_000, activeMs: minutes * 60_000 }) as TrainingSession

describe('engagement', () => {
  it('streak counts consecutive days with ≥ 10 min, today optional', () => {
    expect(streakDays([s(1, 20), s(2, 15), s(3, 12), s(5, 30)], now)).toBe(3) // yesterday back to 3 days ago
    expect(streakDays([s(0, 12), s(1, 20), s(2, 15)], now)).toBe(3)
    expect(streakDays([s(0, 5), s(1, 20)], now)).toBe(1) // today too short so far: still counts yesterday
    expect(streakDays([s(2, 30)], now)).toBe(0)
    expect(streakDays([s(1, 6), s(1, 6)], now)).toBe(1) // minutes add up per day
  })
  it('daily and weekly minutes', () => {
    const ss = [s(0, 20), s(0, 15), s(3, 40), s(8, 60)]
    expect(minutesOn(ss, now)).toBe(35)
    expect(minutesLast7Days(ss, now)).toBe(75)
    const series = dailySeries(ss, now, 4)
    expect(series.map((d) => d.minutes)).toEqual([40, 0, 0, 35])
  })
})
