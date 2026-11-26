import { describe, expect, it } from 'vitest'
import {
  chordBlocks,
  intervalName,
  invertedMidis,
  noteLabel,
  project,
  scaleMidis,
  SCALE_PATTERNS,
  stackSlot,
  stepLetter,
} from './geometry'

describe('geometry', () => {
  it('projects the origin to the view centre', () => {
    const p = project({ yaw: 0.7, tilt: 0.3, cx: 100, cy: 50, unit: 40 }, 0, 0, 0)
    expect(p.x).toBeCloseTo(100)
    expect(p.y).toBeCloseTo(50)
  })
  it('makes nearer points larger', () => {
    const v = { yaw: 0, tilt: 0, cx: 0, cy: 0, unit: 1 }
    expect(project(v, 0, 0, 1).s).toBeGreaterThan(project(v, 0, 0, -1).s)
  })
  it('names notes and intervals', () => {
    expect(noteLabel(60)).toBe('C4')
    expect(noteLabel(61)).toBe('C♯4')
    expect(intervalName(7)).toBe('perfect 5th')
    expect(intervalName(12)).toBe('octave')
  })
  it('builds scales from patterns', () => {
    expect(scaleMidis(60, SCALE_PATTERNS.major)).toEqual([60, 62, 64, 65, 67, 69, 71, 72])
    expect(scaleMidis(57, SCALE_PATTERNS.minor).at(-1)).toBe(69)
    expect(stepLetter(1)).toBe('H')
    expect(stepLetter(2)).toBe('W')
  })
  it('stacks thirds and inverts', () => {
    const b = chordBlocks(60, 'dom7')
    expect(b.map((x) => x.midi)).toEqual([60, 64, 67, 70])
    expect(b.map((x) => x.third)).toEqual(['', 'M3', 'm3', 'm3'])
    expect(invertedMidis(60, 'maj', 1)).toEqual([64, 67, 72])
    expect(invertedMidis(60, 'maj', 2)).toEqual([67, 72, 76])
    expect(invertedMidis(60, 'maj', 9)).toEqual([67, 72, 76]) // clamped to the chord size
  })
  it('rotates stack slots', () => {
    expect(stackSlot(0, 0, 3)).toBe(0)
    expect(stackSlot(0, 1, 3)).toBe(2)
    expect(stackSlot(1, 1, 3)).toBe(0)
  })
})
