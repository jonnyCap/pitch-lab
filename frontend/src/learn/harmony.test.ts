import { describe, expect, it } from 'vitest'
import { Chord, Key, Scale } from 'tonal'
import { mulberry32 } from '@/lib/random'
import {
  CHORD_ORDER,
  CHORDS,
  chordById,
  CIRCLE,
  earMidis,
  keyInfo,
  MAJOR_KEYS,
  makeChordNotes,
  makeScaleNotes,
  SCALE_ORDER_EAR,
  SCALE_ORDER_SIGHT,
  SCALES,
} from './harmony'
import { deckById } from './decks'
import { parseNote } from './notes'

const TONAL_SCALE: Record<string, string> = {
  major: 'major',
  'natural-minor': 'minor',
  'harmonic-minor': 'harmonic minor',
  'melodic-minor': 'melodic minor',
  dorian: 'dorian',
  phrygian: 'phrygian',
  lydian: 'lydian',
  mixolydian: 'mixolydian',
  locrian: 'locrian',
}
const TONAL_CHORD: Record<string, string> = {
  major: 'M',
  minor: 'm',
  dim: 'dim',
  aug: 'aug',
  dom7: '7',
  maj7: 'maj7',
  min7: 'm7',
  'half-dim7': 'm7b5',
  dim7: 'dim7',
}

describe('harmony catalogues', () => {
  it('scale and chord intervals match tonal', () => {
    for (const s of SCALES)
      expect(s.intervals).toEqual(Scale.get(`C ${TONAL_SCALE[s.id]}`).intervals)
    for (const c of CHORDS)
      expect(c.intervals).toEqual(Chord.get(`C${TONAL_CHORD[c.id]}`).intervals)
    expect(chordById('dim7').semitones).toEqual([0, 3, 6, 9])
    expect([...SCALE_ORDER_SIGHT].sort()).toEqual(SCALES.map((s) => s.id).sort())
    for (const id of SCALE_ORDER_EAR) expect(SCALES.some((s) => s.id === id)).toBe(true)
    expect([...CHORD_ORDER].sort()).toEqual(CHORDS.map((c) => c.id).sort())
  })
  it('keys: 15 majors with relative minors; circle covers 12 positions', () => {
    expect(MAJOR_KEYS).toHaveLength(15)
    expect(keyInfo('Eb')).toEqual({ major: 'Eb', minor: 'C', alteration: -3 })
    expect(keyInfo('F#').alteration).toBe(6)
    for (const k of MAJOR_KEYS) expect(Key.majorKey(k).alteration).toBe(keyInfo(k).alteration)
    expect(new Set(CIRCLE.map((c) => keyInfo(c.major).alteration)).size).toBe(12)
  })
})

describe('generators', () => {
  it('scales: correctly spelled, 8 ascending notes, one letter each, within C4–C6', () => {
    for (const id of SCALE_ORDER_SIGHT) {
      for (let s = 1; s <= 30; s++) {
        const notes = makeScaleNotes(id, mulberry32(s * 7 + id.length))
        expect(notes).toHaveLength(8)
        const midis = notes.map((n) => parseNote(n).midi)
        for (let i = 1; i < midis.length; i++) expect(midis[i]!).toBeGreaterThan(midis[i - 1]!)
        expect(midis[7]! - midis[0]!).toBe(12)
        expect(new Set(notes.slice(0, 7).map((n) => parseNote(n).letter)).size).toBe(7)
        expect(midis[7]!).toBeLessThanOrEqual(84)
        const def = SCALES.find((x) => x.id === id)!
        expect(midis.slice(0, 7).map((m) => m - midis[0]!)).toEqual(def.semitones)
      }
    }
  })
  it('chords: stacked thirds, inversions move the bass, readable spelling', () => {
    for (const id of CHORD_ORDER) {
      const c = chordById(id)
      for (let inv = 0; inv < c.intervals.length; inv++) {
        for (let s = 1; s <= 20; s++) {
          const notes = makeChordNotes(id, inv, mulberry32(s * 13 + inv))
          const midis = notes.map((n) => parseNote(n).midi)
          for (let i = 1; i < midis.length; i++) expect(midis[i]!).toBeGreaterThan(midis[i - 1]!)
          const pcs = new Set(midis.map((m) => m % 12))
          const root = parseNote(notes[(c.intervals.length - inv) % c.intervals.length]!).midi % 12
          expect([...pcs].map((p) => (p - root + 12) % 12).sort((a, b) => a - b)).toEqual(
            [...c.semitones].sort((a, b) => a - b),
          )
          for (const n of notes) expect(['', '#', 'b']).toContain(parseNote(n).acc)
        }
      }
    }
  })
  it('ear midis stay in range and keep the shape', () => {
    for (let s = 1; s <= 100; s++) {
      const m = earMidis([0, 4, 7, 11], mulberry32(s), 48, 79)
      expect(m[0]).toBeGreaterThanOrEqual(48)
      expect(m[3]).toBeLessThanOrEqual(79)
      expect(m.map((x) => x - m[0]!)).toEqual([0, 4, 7, 11])
    }
  })
  it('key-signature questions offer only same-mode keys', () => {
    const d = deckById('key-signatures')
    const q = d.makeQuestion('min:C', {
      rng: mulberry32(1),
      introduced: ['maj:C', 'maj:G', 'maj:F', 'min:A', 'min:C'],
    })
    expect(q.kind === 'choice' && q.choices.map((c) => c.id)).toEqual(['A', 'C'])
    expect(q.kind === 'choice' && q.visual).toMatchObject({
      type: 'staff',
      keySignature: 'Eb',
      notes: [],
    })
  })
})
