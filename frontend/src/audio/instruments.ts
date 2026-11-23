/**
 * Timbre registry. A timbre is either synthesized on the fly or backed by a set
 * of recorded samples (served from /samples/<id>/<midi>.<ext>, produced by
 * scripts/prepare-samples). Sample sets may be sparse: notes between samples are
 * repitched from the nearest recorded note (max ±2 semitones keeps timbre natural).
 */
import type { SynthWaveform } from './synth'

export type TimbreId = string

export type TimbreSource =
  | { kind: 'synth'; waveform: SynthWaveform }
  | { kind: 'samples'; baseUrl: string; notes: readonly number[] }

export interface TimbreDef {
  id: TimbreId
  label: string
  source: TimbreSource
  /** Lowest / highest MIDI note this timbre may be asked to play. */
  range: readonly [number, number]
}

export const SYNTH_TIMBRES: readonly TimbreDef[] = [
  {
    id: 'complex',
    label: 'Complex tone',
    source: { kind: 'synth', waveform: 'complex' },
    range: [36, 96],
  },
  { id: 'sine', label: 'Sine', source: { kind: 'synth', waveform: 'sine' }, range: [36, 96] },
  { id: 'square', label: 'Square', source: { kind: 'synth', waveform: 'square' }, range: [36, 96] },
]

const registry = new Map<TimbreId, TimbreDef>(SYNTH_TIMBRES.map((t) => [t.id, t]))

export function registerTimbre(def: TimbreDef): void {
  registry.set(def.id, def)
}

export function getTimbre(id: TimbreId): TimbreDef {
  const t = registry.get(id)
  if (!t) throw new Error(`unknown timbre: ${id}`)
  return t
}

export function listTimbres(): TimbreDef[] {
  return [...registry.values()]
}

/** Picks the recorded note closest to `midi` and the playback rate needed to reach it. */
export function nearestSample(
  notes: readonly number[],
  midi: number,
): { sampleMidi: number; playbackRate: number } {
  if (notes.length === 0) throw new Error('timbre has no samples')
  let best = notes[0]!
  for (const n of notes) {
    if (Math.abs(n - midi) < Math.abs(best - midi)) best = n
  }
  return { sampleMidi: best, playbackRate: Math.pow(2, (midi - best) / 12) }
}
