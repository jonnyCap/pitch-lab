/**
 * Spelled notes (letter + accidental + octave) and their place on the staff.
 * Scientific pitch notation: C4 = middle C = MIDI 60. Accidentals: '#' / 'b'.
 */
import { Note } from 'tonal'

export type Clef = 'treble' | 'bass'
export type Letter = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B'
export const LETTERS: readonly Letter[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B']

export interface SpelledNote {
  name: string
  letter: Letter
  acc: '' | '#' | 'b' | '##' | 'bb'
  octave: number
  midi: number
}

export function parseNote(name: string): SpelledNote {
  const n = Note.get(name)
  if (n.empty || n.oct === undefined || n.midi === null) throw new Error(`invalid note: ${name}`)
  return {
    name: n.name,
    letter: n.letter as Letter,
    acc: n.acc as SpelledNote['acc'],
    octave: n.oct,
    midi: n.midi,
  }
}

/** Diatonic position: one step per letter (C4 = 28). Equal steps = same line/space. */
export function staffStep(name: string): number {
  const n = parseNote(name)
  return n.octave * 7 + LETTERS.indexOf(n.letter)
}

/** Bottom and top line of each clef's five-line staff. */
export const STAFF_LINES: Record<Clef, { bottom: string; top: string }> = {
  treble: { bottom: 'E4', top: 'F5' },
  bass: { bottom: 'G2', top: 'A3' },
}

/** Number of ledger lines a note needs (0 inside the staff). */
export function ledgerLines(name: string, clef: Clef): number {
  const s = staffStep(name)
  const lo = staffStep(STAFF_LINES[clef].bottom)
  const hi = staffStep(STAFF_LINES[clef].top)
  if (s < lo) return Math.floor((lo - s) / 2)
  if (s > hi) return Math.floor((s - hi) / 2)
  return 0
}

/** Pretty name for display: F#4 → F♯4. */
export function prettyNote(name: string, withOctave = true): string {
  const n = parseNote(name)
  const acc = n.acc.replace(/#/g, '♯').replace(/b/g, '♭')
  return `${n.letter}${acc}${withOctave ? n.octave : ''}`
}

/** Pretty pitch name without octave: 'Bb' → 'B♭'. */
export function prettyPitch(pitch: string): string {
  return pitch.replace(/#/g, '♯').replace(/b/g, '♭')
}

export function chromaOf(name: string): number {
  return ((parseNote(name).midi % 12) + 12) % 12
}

/** Pitch-class (0–11) of a pitch name without octave, e.g. 'Db' → 1. */
export function pitchNameChroma(pitch: string): number {
  return chromaOf(`${pitch}4`)
}
