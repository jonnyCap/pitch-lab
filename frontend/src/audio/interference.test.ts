import { describe, expect, it } from 'vitest'
import { estimateF0 } from './analysis'
import { pinkNoise, shepardGlissando } from './interference'

const SR = 22050

describe('shepardGlissando', () => {
  const g = shepardGlissando({ sampleRate: SR, durationSec: 4 })

  it('has the requested length, fades and no clipping', () => {
    expect(g.length).toBe(4 * SR)
    expect(g[0]).toBe(0)
    let peak = 0
    for (const s of g) {
      expect(Number.isFinite(s)).toBe(true)
      peak = Math.max(peak, Math.abs(s))
    }
    expect(peak).toBeLessThan(0.5)
    expect(peak).toBeGreaterThan(0.05)
  })

  it('has no clicks (bounded sample-to-sample jumps)', () => {
    let maxJump = 0
    for (let i = 1; i < g.length; i++) maxJump = Math.max(maxJump, Math.abs(g[i]! - g[i - 1]!))
    expect(maxJump).toBeLessThan(0.15)
  })

  it('descends: estimated pitch of the strongest partial moves down', () => {
    // Compare the same partial region 1 s apart; descending means lower f0 later.
    const a = estimateF0(g.subarray(SR, SR + 4096), SR, 60, 2000)
    const b = estimateF0(g.subarray(2 * SR, 2 * SR + 4096), SR, 60, 2000)
    expect(a).not.toBeNull()
    expect(b).not.toBeNull()
    // Octave-ambiguous by design; compare pitch chroma movement modulo an octave.
    const semis = (12 * Math.log2(b! / a!)) % 12
    const wrapped = ((semis + 18) % 12) - 6
    expect(wrapped).toBeLessThan(0)
  })
})

describe('pinkNoise', () => {
  it('is deterministic with a seeded RNG and bounded', () => {
    let seed = 1
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    const a = pinkNoise(SR, 1, 0.15, rnd)
    seed = 1
    const b = pinkNoise(SR, 1, 0.15, rnd)
    expect(a).toEqual(b)
    expect(Math.max(...a.map(Math.abs))).toBeLessThan(0.5)
  })
})
