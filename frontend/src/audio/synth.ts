/**
 * Synthesized timbres rendered to sample arrays. Deterministic and pure, so
 * tuning and level can be verified in unit tests. Real-instrument samples
 * (piano, strings, winds) are added via the sample registry in instruments.ts.
 */
import { midiToHz } from '@/music/pitch'

export type SynthWaveform = 'sine' | 'complex' | 'square' | 'triangle' | 'bright'

export interface RenderToneOptions {
  sampleRate: number
  midi: number
  waveform: SynthWaveform
  durationSec?: number
  attackSec?: number
  releaseSec?: number
  /** Target RMS over the steady-state portion (keeps loudness equal across timbres). */
  targetRms?: number
  a4?: number
}

/** Harmonic amplitudes for each waveform, band-limited below Nyquist. */
export function harmonicAmplitudes(
  waveform: SynthWaveform,
  f0: number,
  sampleRate: number,
): number[] {
  const nyquist = sampleRate / 2
  const maxH = Math.max(1, Math.floor((nyquist * 0.9) / f0))
  switch (waveform) {
    case 'sine':
      return [1]
    case 'complex': {
      // Fundamental plus harmonics with 1/n roll-off, capped at 10 partials:
      // a neutral "complex tone" (cf. Bermudez & Zatorre 2009 / Wong et al. 2020).
      const n = Math.min(10, maxH)
      return Array.from({ length: n }, (_, i) => 1 / (i + 1))
    }
    case 'triangle': {
      // Odd harmonics with 1/n² roll-off: soft, flute-like.
      const n = Math.min(15, maxH)
      return Array.from({ length: n }, (_, i) => ((i + 1) % 2 === 1 ? 1 / (i + 1) ** 2 : 0))
    }
    case 'bright': {
      // Strong upper partials (1/n^0.8, 14 partials): reedy, brass-like.
      const n = Math.min(14, maxH)
      return Array.from({ length: n }, (_, i) => 1 / (i + 1) ** 0.8)
    }
    case 'square': {
      // Odd harmonics only, 1/n — an untrained, "unnatural" test timbre.
      const n = Math.min(25, maxH)
      return Array.from({ length: n }, (_, i) => ((i + 1) % 2 === 1 ? 1 / (i + 1) : 0))
    }
  }
}

export function renderTone(opts: RenderToneOptions): Float32Array {
  const {
    sampleRate,
    midi,
    waveform,
    durationSec = 1,
    attackSec = 0.02,
    releaseSec = 0.1,
    targetRms = 0.12,
    a4,
  } = opts
  const f0 = midiToHz(midi, a4)
  const amps = harmonicAmplitudes(waveform, f0, sampleRate)
  const n = Math.round(durationSec * sampleRate)
  const out = new Float32Array(n)
  const w = (2 * Math.PI * f0) / sampleRate

  for (let i = 0; i < n; i++) {
    let s = 0
    for (let h = 0; h < amps.length; h++) {
      const a = amps[h]!
      if (a !== 0) s += a * Math.sin(w * (h + 1) * i)
    }
    out[i] = s
  }

  // Normalise RMS of the raw waveform, then apply the envelope.
  let sumSq = 0
  for (let i = 0; i < n; i++) sumSq += out[i]! * out[i]!
  const rms = Math.sqrt(sumSq / n) || 1
  const k = targetRms / rms
  const att = Math.max(1, Math.round(attackSec * sampleRate))
  const rel = Math.max(1, Math.round(releaseSec * sampleRate))
  for (let i = 0; i < n; i++) {
    let env = 1
    if (i < att) env = i / att
    else if (i > n - rel) env = (n - i) / rel
    out[i] = out[i]! * k * env
  }
  return out
}

/** RMS of a sample array (optionally only a slice). */
export function rms(samples: Float32Array, start = 0, end = samples.length): number {
  let s = 0
  for (let i = start; i < end; i++) s += samples[i]! * samples[i]!
  return Math.sqrt(s / Math.max(1, end - start))
}
