/**
 * Training-dose and motivation metrics. The studies' dose was ~20–40 h over
 * ~8 weeks (≈ 30–60 min/day, 4–5 days/week), and attrition was the biggest
 * problem (Wong et al. 2025: 48 enrolled → 12 analysed), so the app makes the
 * daily and weekly dose visible.
 */
import type { TrainingSession } from '@/data/db'
import { DAY_MS } from './schedule'

export const DAILY_GOAL_MIN = 30
export const WEEKLY_GOAL_MIN = 300
/** Minimum training on a day for it to count towards the streak. */
export const STREAK_MIN = 10

export function dayKey(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function minutesByDay(sessions: readonly TrainingSession[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const s of sessions) {
    const k = dayKey(s.startedAt)
    m.set(k, (m.get(k) ?? 0) + (s.activeMs || 0) / 60000)
  }
  return m
}

export function minutesOn(sessions: readonly TrainingSession[], day: number): number {
  return minutesByDay(sessions).get(dayKey(day)) ?? 0
}

/** Minutes trained in the 7 calendar days ending today. */
export function minutesLast7Days(sessions: readonly TrainingSession[], now: number): number {
  const byDay = minutesByDay(sessions)
  let total = 0
  for (let i = 0; i < 7; i++) total += byDay.get(dayKey(now - i * DAY_MS)) ?? 0
  return total
}

/**
 * Consecutive days (≥ STREAK_MIN minutes each) ending today — or ending
 * yesterday if today has not reached the minimum yet (the streak is not lost
 * until the day is over).
 */
export function streakDays(sessions: readonly TrainingSession[], now: number): number {
  const byDay = minutesByDay(sessions)
  const ok = (t: number) => (byDay.get(dayKey(t)) ?? 0) >= STREAK_MIN
  let day = ok(now) ? now : now - DAY_MS
  let n = 0
  while (ok(day)) {
    n++
    day -= DAY_MS
  }
  return n
}

/** Minutes per day for the last `days` days (oldest first), for charts. */
export function dailySeries(
  sessions: readonly TrainingSession[],
  now: number,
  days: number,
): { day: string; minutes: number }[] {
  const byDay = minutesByDay(sessions)
  return Array.from({ length: days }, (_, i) => {
    const k = dayKey(now - (days - 1 - i) * DAY_MS)
    return { day: k, minutes: byDay.get(k) ?? 0 }
  })
}
