import { describe, expect, it } from 'vitest'
import { mulberry32 } from '@/lib/random'
import {
  centsToHz,
  generatePitchMemoryTrials,
  PM_BASE_HZ,
  pitchMemoryBand,
  summarizePitchMemory,
} from './pitchMemory'

describe('pitch memory check', () => {
  it('uses 27 tones 10 cents apart between 471.58 and ~547.99 Hz', () => {
    expect(centsToHz(PM_BASE_HZ, 260)).toBeCloseTo(547.99, 1)
    const trials = generatePitchMemoryTrials(mulberry32(1))
    expect(trials).toHaveLength(12)
    expect(new Set(trials.map((t) => t.targetHz.toFixed(3))).size).toBe(12)
    for (const t of trials) {
      expect(t.targetHz).toBeGreaterThanOrEqual(PM_BASE_HZ - 1e-9)
      expect(t.targetHz).toBeLessThanOrEqual(548)
      expect([-80, -40, 40, 80]).toContain(t.startCents)
    }
  })
  it('summarises absolute and signed error', () => {
    expect(summarizePitchMemory([10, -30, 20])).toEqual({
      trials: 3,
      meanAbsCents: 20,
      meanSignedCents: 0,
    })
    expect(pitchMemoryBand(24)).toBe('very-precise')
    expect(pitchMemoryBand(45)).toBe('good')
    expect(pitchMemoryBand(90)).toBe('typical')
  })
})
