/**
 * When tests are due.
 *
 * - weekly: 7 days after the most recent AP test while training (Van Hedger et
 *   al. 2019 tested weekly) — progress is measured without feedback, on all
 *   12 pitches, a trained and an untrained instrument;
 * - posttest: right after mastery;
 * - retention: 1 and 3 months after mastery (Wong et al. 2020 retested at 1 and
 *   3 months, Van Hedger et al. 2019 after ~4 months).
 */
import type { TestKind, TestResult } from '@/data/db'
import type { APProgress } from './progress'

export const DAY_MS = 24 * 60 * 60 * 1000
export const WEEKLY_INTERVAL_MS = 7 * DAY_MS
export const RETENTION_1M_MS = 30 * DAY_MS
export const RETENTION_3M_MS = 90 * DAY_MS

export const AP_TEST_KINDS: readonly TestKind[] = [
  'pretest',
  'weekly',
  'posttest',
  'retention_1m',
  'retention_3m',
]

export interface ScheduledTest {
  kind: TestKind
  dueAt: number
}

export function scheduledTests(
  progress: APProgress,
  tests: readonly TestResult[],
): ScheduledTest[] {
  const apTests = tests.filter((t) => AP_TEST_KINDS.includes(t.kind))
  if (!apTests.some((t) => t.kind === 'pretest')) return []
  const has = (kind: TestKind, after = 0) =>
    apTests.some((t) => t.kind === kind && t.takenAt >= after)

  const m = progress.masteredAt
  if (m === null) {
    const last = Math.max(...apTests.map((t) => t.takenAt))
    return [{ kind: 'weekly', dueAt: last + WEEKLY_INTERVAL_MS }]
  }
  const out: ScheduledTest[] = []
  if (!has('posttest', m)) out.push({ kind: 'posttest', dueAt: m })
  if (!has('retention_1m', m)) out.push({ kind: 'retention_1m', dueAt: m + RETENTION_1M_MS })
  if (!has('retention_3m', m)) out.push({ kind: 'retention_3m', dueAt: m + RETENTION_3M_MS })
  return out
}

export function dueTests(
  progress: APProgress,
  tests: readonly TestResult[],
  now: number,
): ScheduledTest[] {
  return scheduledTests(progress, tests).filter((t) => t.dueAt <= now)
}

export const TEST_LABELS: Record<TestKind, string> = {
  pretest: 'Baseline test',
  weekly: 'Weekly test',
  posttest: 'Final test',
  retention_1m: '1-month retention test',
  retention_3m: '3-month retention test',
  pitch_memory: 'Pitch memory check',
}
