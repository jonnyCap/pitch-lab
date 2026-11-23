/** Aggregate statistics for the progress page (pure, unit-tested). */
import type { Trial, TrainingSession } from '@/data/db'
import type { PitchClass } from '@/music/pitch'

export interface PitchAccuracy {
  pitchClass: PitchClass
  n: number
  accuracy: number
}

/** Accuracy per pitch class over the given trials (only classes that occurred). */
export function perPitchAccuracy(trials: readonly Trial[]): PitchAccuracy[] {
  const m = new Map<PitchClass, { n: number; c: number }>()
  for (const t of trials) {
    const s = m.get(t.pitchClass) ?? { n: 0, c: 0 }
    s.n++
    if (t.correct) s.c++
    m.set(t.pitchClass, s)
  }
  return [...m.entries()]
    .sort(([a], [b]) => a - b)
    .map(([pitchClass, s]) => ({ pitchClass, n: s.n, accuracy: s.c / s.n }))
}

export function totalActiveMs(sessions: readonly TrainingSession[]): number {
  return sessions.reduce((sum, s) => sum + (s.activeMs || 0), 0)
}

/** Distinct calendar days (local time) with at least one session. */
export function trainingDays(sessions: readonly TrainingSession[]): number {
  return new Set(sessions.map((s) => new Date(s.startedAt).toDateString())).size
}

export function formatDuration(ms: number): string {
  const min = Math.round(ms / 60000)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  return `${h} h ${min % 60} min`
}
