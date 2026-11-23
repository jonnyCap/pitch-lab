import { describe, expect, it } from 'vitest'
import { getTimbre, nearestSample, registerTimbre } from './instruments'

describe('instruments', () => {
  it('repitches from the nearest recorded note', () => {
    const notes = [48, 51, 54, 57, 60] // every minor third, like Salamander
    expect(nearestSample(notes, 52)).toEqual({ sampleMidi: 51, playbackRate: Math.pow(2, 1 / 12) })
    expect(nearestSample(notes, 47).sampleMidi).toBe(48)
    expect(nearestSample(notes, 60)).toEqual({ sampleMidi: 60, playbackRate: 1 })
  })

  it('compensates the measured detune of the recording', () => {
    // Sample at 96 is 12 cents sharp; playing 96 must slow it by 12 cents.
    const r = nearestSample([92, 96], 96, { 96: 12 })
    expect(r.sampleMidi).toBe(96)
    expect(1200 * Math.log2(r.playbackRate)).toBeCloseTo(-12, 9)
    const up = nearestSample([92, 96], 94, { 92: -5 })
    expect(1200 * Math.log2(up.playbackRate)).toBeCloseTo(205, 9)
  })

  it('registers and resolves timbres', () => {
    expect(getTimbre('complex').source.kind).toBe('synth')
    registerTimbre({
      id: 'piano',
      label: 'Piano',
      source: { kind: 'samples', baseUrl: '/samples/piano', notes: [60] },
      range: [21, 108],
    })
    expect(getTimbre('piano').label).toBe('Piano')
    expect(() => getTimbre('nope')).toThrow()
  })
})
