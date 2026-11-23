import { describe, expect, it } from 'vitest'
import {
  ALL_PITCH_CLASSES,
  centsOff,
  circularSemitoneError,
  hzToMidi,
  midiOf,
  midiToHz,
  midiToName,
  octaveOf,
  pitchClassLabel,
  pitchClassOf,
  signedPitchClassDiff,
  type PitchClass,
} from './pitch'

describe('pitch', () => {
  it('maps MIDI to frequency (A4 = 440, C4 ≈ 261.63)', () => {
    expect(midiToHz(69)).toBe(440)
    expect(midiToHz(60)).toBeCloseTo(261.6256, 3)
    expect(midiToHz(81)).toBeCloseTo(880, 9)
    expect(hzToMidi(440)).toBe(69)
    expect(hzToMidi(midiToHz(53.5))).toBeCloseTo(53.5, 9)
  })

  it('measures cents deviation', () => {
    expect(centsOff(440)).toBeCloseTo(0, 9)
    expect(centsOff(440 * Math.pow(2, 10 / 1200))).toBeCloseTo(10, 6)
    expect(centsOff(440 * Math.pow(2, -30 / 1200))).toBeCloseTo(-30, 6)
  })

  it('derives pitch class, octave and names', () => {
    expect(pitchClassOf(60)).toBe(0)
    expect(pitchClassOf(61)).toBe(1)
    expect(pitchClassOf(71)).toBe(11)
    expect(octaveOf(60)).toBe(4)
    expect(octaveOf(59)).toBe(3)
    expect(midiOf(9, 4)).toBe(69)
    expect(midiToName(66)).toBe('F♯4')
    expect(pitchClassLabel(1)).toBe('C♯/D♭')
    expect(pitchClassLabel(4)).toBe('E')
  })

  it('computes circular semitone error in 0..6', () => {
    expect(circularSemitoneError(0, 0)).toBe(0)
    expect(circularSemitoneError(0, 1)).toBe(1)
    expect(circularSemitoneError(0, 11)).toBe(1)
    expect(circularSemitoneError(2, 8)).toBe(6)
    expect(circularSemitoneError(11, 4)).toBe(5)
    for (const a of ALL_PITCH_CLASSES)
      for (const b of ALL_PITCH_CLASSES) {
        const e = circularSemitoneError(a, b)
        expect(e).toBeGreaterThanOrEqual(0)
        expect(e).toBeLessThanOrEqual(6)
        expect(e).toBe(circularSemitoneError(b, a))
      }
  })

  it('has chance-level MAD of 3 for uniform random answers', () => {
    let sum = 0
    for (const a of ALL_PITCH_CLASSES)
      for (const b of ALL_PITCH_CLASSES) sum += circularSemitoneError(a, b)
    expect(sum / 144).toBe(3)
  })

  it('computes signed difference in (-6, 6]', () => {
    expect(signedPitchClassDiff(4, 5)).toBe(1)
    expect(signedPitchClassDiff(4, 3)).toBe(-1)
    expect(signedPitchClassDiff(11, 0)).toBe(1)
    expect(signedPitchClassDiff(0, 6 as PitchClass)).toBe(6)
  })
})
