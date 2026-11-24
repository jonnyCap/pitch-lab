import { describe, expect, it } from 'vitest'
import type { TestResult } from '@/data/db'
import { initialProgress } from './progress'
import { DAY_MS, dueTests, scheduledTests } from './schedule'

const t = (kind: TestResult['kind'], takenAt: number) =>
  ({ id: kind + takenAt, kind, takenAt, metrics: {} }) as TestResult

describe('test schedule', () => {
  const p = initialProgress()
  it('nothing before the pretest', () => {
    expect(scheduledTests(p, [])).toEqual([])
  })
  it('weekly test 7 days after the most recent AP test (pitch-memory checks do not count)', () => {
    const tests = [t('pretest', 0), t('weekly', 10 * DAY_MS), t('pitch_memory', 15 * DAY_MS)]
    expect(scheduledTests(p, tests)).toEqual([{ kind: 'weekly', dueAt: 17 * DAY_MS }])
    expect(dueTests(p, tests, 16 * DAY_MS)).toEqual([])
    expect(dueTests(p, tests, 17 * DAY_MS)).toHaveLength(1)
  })
  it('after mastery: posttest now, retention at 1 and 3 months', () => {
    const m = { ...p, masteredAt: 100 * DAY_MS }
    const tests = [t('pretest', 0)]
    expect(scheduledTests(m, tests).map((x) => [x.kind, x.dueAt / DAY_MS])).toEqual([
      ['posttest', 100],
      ['retention_1m', 130],
      ['retention_3m', 190],
    ])
    const after = [...tests, t('posttest', 100 * DAY_MS + 5), t('retention_1m', 131 * DAY_MS)]
    expect(dueTests(m, after, 200 * DAY_MS).map((x) => x.kind)).toEqual(['retention_3m'])
  })
})
