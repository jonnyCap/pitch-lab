import { describe, expect, it } from 'vitest'
import { contextTimeToPerfMs, responseTimeMs } from './timing'

describe('contextTimeToPerfMs', () => {
  it('uses getOutputTimestamp when available', () => {
    const ctx = {
      currentTime: 10.1,
      getOutputTimestamp: () => ({ contextTime: 10, performanceTime: 5000 }),
    }
    expect(contextTimeToPerfMs(ctx, 10.5)).toBeCloseTo(5500, 6)
  })

  it('falls back to currentTime + output latency', () => {
    const ctx = { currentTime: 2, outputLatency: 0.02 }
    expect(contextTimeToPerfMs(ctx, 2.06, () => 1000)).toBeCloseTo(1080, 6)
  })

  it('ignores an unusable timestamp (performanceTime 0 before first render)', () => {
    const ctx = {
      currentTime: 0,
      baseLatency: 0.01,
      getOutputTimestamp: () => ({ contextTime: 0, performanceTime: 0 }),
    }
    expect(contextTimeToPerfMs(ctx, 0.05, () => 200)).toBeCloseTo(260, 6)
  })
})

describe('responseTimeMs', () => {
  it('rounds and clamps at 0', () => {
    expect(responseTimeMs(1000, 1734.6)).toBe(735)
    expect(responseTimeMs(1000, 990)).toBe(0)
  })
})
