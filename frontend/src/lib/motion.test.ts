import { afterEach, describe, expect, it, vi } from 'vitest'
import { dur, E2E, prefersReducedMotion, sleep } from './motion'

function mockReduced(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({ matches, addEventListener() {}, removeEventListener() {} }),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('motion', () => {
  it('E2E is false in unit tests', () => {
    expect(E2E).toBe(false)
  })
  it('dur passes through by default', () => {
    mockReduced(false)
    expect(dur(450)).toBe(450)
  })
  it('dur is 0 under reduced motion', () => {
    mockReduced(true)
    expect(prefersReducedMotion()).toBe(true)
    expect(dur(450)).toBe(0)
  })
  it('prefersReducedMotion survives a throwing matchMedia', () => {
    vi.stubGlobal('matchMedia', () => {
      throw new Error('x')
    })
    expect(prefersReducedMotion()).toBe(false)
  })
  it('sleep resolves after dur(ms)', async () => {
    mockReduced(false)
    vi.useFakeTimers()
    let done = false
    void sleep(100).then(() => (done = true))
    await vi.advanceTimersByTimeAsync(99)
    expect(done).toBe(false)
    await vi.advanceTimersByTimeAsync(2)
    expect(done).toBe(true)
  })
})

describe('motion in e2e mode', () => {
  it('caps durations at 20ms', async () => {
    vi.resetModules()
    vi.stubEnv('MODE', 'e2e')
    mockReduced(false)
    const m = await import('./motion')
    expect(m.E2E).toBe(true)
    expect(m.dur(900)).toBe(20)
    expect(m.dur(5)).toBe(5)
    vi.unstubAllEnvs()
  })
})
