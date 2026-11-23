import { describe, expect, it } from 'vitest'
import { midiToHz } from '@/music/pitch'
import { estimateF0, medianPitchMidi } from './analysis'

const SR = 44100

function vibratoTone(
  midi: number,
  depthCents: number,
  rateHz: number,
  offsetCents = 0,
): Float32Array {
  const out = new Float32Array(SR)
  let phase = 0
  for (let i = 0; i < out.length; i++) {
    const cents = offsetCents + depthCents * Math.sin((2 * Math.PI * rateHz * i) / SR)
    const f = midiToHz(midi) * Math.pow(2, cents / 1200)
    phase += (2 * Math.PI * f) / SR
    out[i] = 0.5 * Math.sin(phase) + 0.25 * Math.sin(2 * phase) + 0.12 * Math.sin(3 * phase)
  }
  return out
}

describe('medianPitchMidi', () => {
  it('finds the centre pitch of a vibrato tone, where a single window does not', () => {
    const tone = vibratoTone(69, 20, 5.5, 3)
    const single = estimateF0(tone.subarray(Math.round(0.2 * SR), Math.round(0.2 * SR) + 4096), SR)!
    const singleCents = (69 + 12 * Math.log2(single / 440) - 69) * 100
    const median = medianPitchMidi(tone, SR)!
    expect(Math.abs((median - 69) * 100 - 3)).toBeLessThan(2)
    // Sanity: the single-window reading is off by more (it samples one vibrato phase).
    expect(Math.abs(singleCents - 3)).toBeGreaterThan(Math.abs((median - 69) * 100 - 3))
  })

  it('handles steady tones across the range', () => {
    for (const midi of [48, 60, 72, 84, 95]) {
      expect(
        Math.abs((medianPitchMidi(vibratoTone(midi, 0, 5), SR, { hop: 8192 })! - midi) * 100),
      ).toBeLessThan(2)
    }
  })

  it('returns null for silence', () => {
    expect(medianPitchMidi(new Float32Array(SR), SR, { hop: 8192 })).toBeNull()
  })
})
