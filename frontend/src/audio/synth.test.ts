import { describe, expect, it } from 'vitest'
import { centsOff, midiToHz } from '@/music/pitch'
import { estimateF0 } from './analysis'
import { harmonicAmplitudes, renderTone, rms, type SynthWaveform } from './synth'

const SR = 44100
const waveforms: SynthWaveform[] = ['sine', 'complex', 'square', 'triangle', 'bright']

describe('renderTone', () => {
  it.each(waveforms)('%s is in tune within ±5 cents across C3–C7', (waveform) => {
    for (let midi = 48; midi <= 96; midi += 5) {
      const tone = renderTone({ sampleRate: SR, midi, waveform })
      // Analyse a steady-state window (skip attack).
      const win = tone.subarray(Math.round(0.2 * SR), Math.round(0.2 * SR) + 4096)
      const f0 = estimateF0(win, SR)
      expect(f0, `midi ${midi}`).not.toBeNull()
      expect(Math.abs(centsOff(f0!)), `midi ${midi} f0 ${f0}`).toBeLessThan(5)
      expect(Math.abs(Math.round(12 * Math.log2(f0! / midiToHz(midi))))).toBe(0)
    }
  })

  it.each(waveforms)('%s has equal loudness (steady-state RMS within ±1 dB)', (waveform) => {
    const target = 0.12
    for (const midi of [48, 60, 72, 84]) {
      const t = renderTone({ sampleRate: SR, midi, waveform, targetRms: target })
      const level = rms(t, Math.round(0.1 * SR), Math.round(0.8 * SR))
      const db = 20 * Math.log10(level / target)
      expect(Math.abs(db)).toBeLessThan(1)
    }
  })

  it('has 1 s duration, silent edges and no clipping', () => {
    const t = renderTone({ sampleRate: SR, midi: 69, waveform: 'square' })
    expect(t.length).toBe(SR)
    expect(t[0]).toBe(0)
    expect(Math.abs(t[t.length - 1]!)).toBeLessThan(1e-3)
    expect(Math.max(...t.map(Math.abs))).toBeLessThan(1)
  })

  it('keeps harmonics below Nyquist', () => {
    const f0 = midiToHz(100)
    const amps = harmonicAmplitudes('square', f0, SR)
    expect(amps.length * f0).toBeLessThan(SR / 2)
  })
})
