/**
 * Pitch utilities. MIDI note numbers with A4 = 69 = 440 Hz (12-TET).
 * Pitch classes: 0 = C, 1 = C#/Db, ... 11 = B.
 */

export type PitchClass = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11

export const A4_MIDI = 69
export const A4_HZ = 440

export const PITCH_CLASS_NAMES_SHARP = [
  'C',
  'C♯',
  'D',
  'D♯',
  'E',
  'F',
  'F♯',
  'G',
  'G♯',
  'A',
  'A♯',
  'B',
] as const
export const PITCH_CLASS_NAMES_FLAT = [
  'C',
  'D♭',
  'D',
  'E♭',
  'E',
  'F',
  'G♭',
  'G',
  'A♭',
  'A',
  'B♭',
  'B',
] as const

/** Name shown on the 12-category pitch wheel, e.g. "C♯/D♭". */
export function pitchClassLabel(pc: PitchClass): string {
  const s = PITCH_CLASS_NAMES_SHARP[pc]
  const f = PITCH_CLASS_NAMES_FLAT[pc]
  return s === f ? s : `${s}/${f}`
}

export function midiToHz(midi: number, a4 = A4_HZ): number {
  return a4 * Math.pow(2, (midi - A4_MIDI) / 12)
}

export function hzToMidi(hz: number, a4 = A4_HZ): number {
  return A4_MIDI + 12 * Math.log2(hz / a4)
}

/** Deviation in cents of `hz` from the nearest equal-tempered pitch. */
export function centsOff(hz: number, a4 = A4_HZ): number {
  const m = hzToMidi(hz, a4)
  return (m - Math.round(m)) * 100
}

export function pitchClassOf(midi: number): PitchClass {
  return (((Math.round(midi) % 12) + 12) % 12) as PitchClass
}

/** Scientific pitch notation octave: C4 = MIDI 60 = middle C. */
export function octaveOf(midi: number): number {
  return Math.floor(Math.round(midi) / 12) - 1
}

export function midiOf(pc: PitchClass, octave: number): number {
  return (octave + 1) * 12 + pc
}

/** "C♯4"-style name using sharps. */
export function midiToName(midi: number): string {
  return `${PITCH_CLASS_NAMES_SHARP[pitchClassOf(midi)]}${octaveOf(midi)}`
}

/**
 * Circular distance between two pitch classes in semitones (0..6).
 * This is the per-trial error used for MAD (mean absolute deviation) scoring:
 * chance level for uniformly random answers is 3.0.
 */
export function circularSemitoneError(a: PitchClass, b: PitchClass): number {
  const d = Math.abs(a - b) % 12
  return d > 6 ? 12 - d : d
}

/** Signed circular difference response - target in (-6, 6], useful for confusion direction. */
export function signedPitchClassDiff(target: PitchClass, response: PitchClass): number {
  let d = (((response - target) % 12) + 12) % 12
  if (d > 6) d -= 12
  return d
}

export const ALL_PITCH_CLASSES: readonly PitchClass[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
