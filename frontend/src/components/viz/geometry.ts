/** Pure geometry + music helpers shared by the 3D-ish visualisations. */

export const TAU = Math.PI * 2
export const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']

export const noteName = (midi: number) => NOTE_NAMES[((midi % 12) + 12) % 12]!
export const noteLabel = (midi: number) => `${noteName(midi)}${Math.floor(midi / 12) - 1}`

export interface View {
  yaw: number
  tilt: number
  /** Screen centre of the world origin. */
  cx: number
  cy: number
  /** Pixels per world unit. */
  unit: number
  /** Camera distance (perspective strength). */
  f?: number
}
export interface Pt {
  x: number
  y: number
  /** Depth after rotation: larger = nearer. */
  z: number
  /** Perspective scale. */
  s: number
}

/** World (x right, y up, z toward viewer) → screen, with yaw about y then tilt about x. */
export function project(v: View, px: number, py: number, pz: number): Pt {
  const x = px * Math.cos(v.yaw) + pz * Math.sin(v.yaw)
  const z0 = -px * Math.sin(v.yaw) + pz * Math.cos(v.yaw)
  const y = py * Math.cos(v.tilt) - z0 * Math.sin(v.tilt)
  const z = py * Math.sin(v.tilt) + z0 * Math.cos(v.tilt)
  const f = v.f ?? 3.2
  const s = f / (f - z)
  return { x: v.cx + x * s * v.unit, y: v.cy - y * s * v.unit, z, s }
}

/** Point on a horizontal circle; pitch class 0 (C) sits at +z (nearest the viewer), like the helix. */
export function ringPoint(pitchClass: number, radius = 1, y = 0): [number, number, number] {
  const th = (pitchClass / 12) * TAU
  return [Math.sin(th) * radius, y, Math.cos(th) * radius]
}

/** Upward interval spelled the way lessons do. */
const INTERVAL_NAMES = [
  'unison',
  'minor 2nd',
  'major 2nd',
  'minor 3rd',
  'major 3rd',
  'perfect 4th',
  'tritone',
  'perfect 5th',
  'minor 6th',
  'major 6th',
  'minor 7th',
  'major 7th',
  'octave',
]
const INTERVAL_SHORT = [
  'P1',
  'm2',
  'M2',
  'm3',
  'M3',
  'P4',
  'TT',
  'P5',
  'm6',
  'M6',
  'm7',
  'M7',
  'P8',
]
export function intervalName(semitones: number): string {
  return INTERVAL_NAMES[Math.max(0, Math.min(12, Math.round(semitones)))]!
}
export function intervalShort(semitones: number): string {
  return INTERVAL_SHORT[Math.max(0, Math.min(12, Math.round(semitones)))]!
}

/** Scale patterns in semitone steps. */
export const SCALE_PATTERNS = {
  major: [2, 2, 1, 2, 2, 2, 1],
  minor: [2, 1, 2, 2, 1, 2, 2],
  harmonicMinor: [2, 1, 2, 2, 1, 3, 1],
  dorian: [2, 1, 2, 2, 2, 1, 2],
  phrygian: [1, 2, 2, 2, 1, 2, 2],
  lydian: [2, 2, 2, 1, 2, 2, 1],
  mixolydian: [2, 2, 1, 2, 2, 1, 2],
  locrian: [1, 2, 2, 1, 2, 2, 2],
} as const

export const stepLetter = (semitones: number) =>
  semitones === 1 ? 'H' : semitones === 2 ? 'W' : semitones === 3 ? 'W+H' : `${semitones}`

/** MIDI notes of a scale from its tonic: tonic plus cumulative steps. */
export function scaleMidis(tonic: number, pattern: readonly number[]): number[] {
  const out = [tonic]
  for (const s of pattern) out.push(out[out.length - 1]! + s)
  return out
}

export type ChordQuality =
  'maj' | 'min' | 'dim' | 'aug' | 'dom7' | 'maj7' | 'min7' | 'hdim7' | 'dim7'

/** Stacked-third offsets from the root. */
const CHORDS: Record<ChordQuality, { name: string; offsets: number[] }> = {
  maj: { name: 'major', offsets: [0, 4, 7] },
  min: { name: 'minor', offsets: [0, 3, 7] },
  dim: { name: 'diminished', offsets: [0, 3, 6] },
  aug: { name: 'augmented', offsets: [0, 4, 8] },
  dom7: { name: 'dominant 7th', offsets: [0, 4, 7, 10] },
  maj7: { name: 'major 7th', offsets: [0, 4, 7, 11] },
  min7: { name: 'minor 7th', offsets: [0, 3, 7, 10] },
  hdim7: { name: 'half-diminished 7th', offsets: [0, 3, 6, 10] },
  dim7: { name: 'diminished 7th', offsets: [0, 3, 6, 9] },
}
export const chordName = (q: ChordQuality) => CHORDS[q].name
export const chordTones = (q: ChordQuality) => CHORDS[q].offsets.length
const DEGREE = ['root', '3rd', '5th', '7th']

export interface ChordBlock {
  /** Chord-tone index in root position (0 root … 3 seventh). */
  tone: number
  midi: number
  degree: string
  /** Third from the tone below it in root position ('' for the root). */
  third: string
}

/** The chord's tones in root position, each with the third that sits on top of the one below. */
export function chordBlocks(root: number, quality: ChordQuality): ChordBlock[] {
  const offs = CHORDS[quality].offsets
  return offs.map((o, i) => ({
    tone: i,
    midi: root + o,
    degree: DEGREE[i]!,
    third: i === 0 ? '' : offs[i]! - offs[i - 1]! === 4 ? 'M3' : 'm3',
  }))
}

/** Sounding MIDI order for an inversion: the lowest `inversion` tones move up an octave. */
export function invertedMidis(root: number, quality: ChordQuality, inversion: number): number[] {
  const blocks = chordBlocks(root, quality)
  const k = Math.max(0, Math.min(blocks.length - 1, Math.round(inversion)))
  return blocks.map((b, i) => (i < k ? b.midi + 12 : b.midi)).sort((a, b) => a - b)
}

export const inversionName = (k: number) =>
  ['Root position', '1st inversion', '2nd inversion', '3rd inversion'][k] ?? `${k}th inversion`

/** Slot (0 = bottom) of chord tone `tone` while the stack is `inversion` steps rotated (fractional ok). */
export function stackSlot(tone: number, inversion: number, n: number): number {
  return (((tone - inversion) % n) + n) % n
}

export const easeOut = (t: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3)
export const easeInOut = (t: number) => {
  const x = Math.max(0, Math.min(1, t))
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
}

/**
 * Cuboid corners (x0..x1, y0..y1, z0..z1) projected; returns the polygons of its
 * top, right and front faces (the three that face a camera looking from front-right, above).
 */
export function cuboidFaces(
  v: View,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  z0: number,
  z1: number,
): { top: Pt[]; front: Pt[]; side: Pt[] } {
  const P = (x: number, y: number, z: number) => project(v, x, y, z)
  return {
    top: [P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0), P(x0, y1, z0)],
    front: [P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)],
    side: [P(x1, y0, z1), P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1)],
  }
}
