/**
 * Interference stimuli used to clear auditory working memory before no-feedback
 * and test blocks, so learners cannot carry a reference tone over from feedback
 * (Wong et al. 2020: 15 s glissando; Wong et al. 2025: descending Shepard tone).
 *
 * Generated as raw sample arrays (pure functions → unit-testable), then wrapped
 * into AudioBuffers by `toAudioBuffer`.
 */

export interface ShepardOptions {
  sampleRate: number
  durationSec: number
  /** Lowest frequency of the spectral window. */
  fMin?: number
  /** Number of octaves spanned by the window (= number of partials). */
  octaves?: number
  /** Glide speed in octaves per second (positive = descending). */
  octavesPerSec?: number
  /** Peak output amplitude. */
  gain?: number
  /** Fade-in/out duration in seconds. */
  fadeSec?: number
}

/**
 * Descending Shepard–Risset glissando: octave-spaced partials glide continuously
 * downward under a fixed raised-cosine spectral envelope (in log-frequency).
 * Each partial wraps from bottom to top where its amplitude is zero, so the
 * illusion of endless descent has no audible discontinuity and no stable pitch.
 */
export function shepardGlissando(opts: ShepardOptions): Float32Array {
  const {
    sampleRate,
    durationSec,
    fMin = 40,
    octaves = 8,
    octavesPerSec = 0.12,
    gain = 0.25,
    fadeSec = 0.5,
  } = opts
  const n = Math.round(sampleRate * durationSec)
  const out = new Float32Array(n)
  const phases = new Float64Array(octaves)
  const twoPi = 2 * Math.PI
  const fade = Math.max(1, Math.round(fadeSec * sampleRate))
  // Normalise so the summed envelope weights stay ~constant (Σ of raised-cosine ≈ octaves/2).
  const norm = gain / (octaves / 2)

  for (let i = 0; i < n; i++) {
    const t = i / sampleRate
    let s = 0
    for (let k = 0; k < octaves; k++) {
      // Position of partial k in the window, in [0, 1). Descends over time.
      let p = (k / octaves - (t * octavesPerSec) / octaves) % 1
      if (p < 0) p += 1
      const f = fMin * Math.pow(2, p * octaves)
      phases[k] = (phases[k]! + (twoPi * f) / sampleRate) % twoPi
      const amp = 0.5 - 0.5 * Math.cos(twoPi * p) // 0 at the edges, 1 in the middle
      s += amp * Math.sin(phases[k]!)
    }
    let env = 1
    if (i < fade) env = i / fade
    else if (i > n - fade) env = (n - i) / fade
    out[i] = s * norm * env
  }
  return out
}

/** Pink-ish noise (Paul Kellet's economy filter) with fades. Seedable for tests. */
export function pinkNoise(
  sampleRate: number,
  durationSec: number,
  gain = 0.15,
  random: () => number = Math.random,
  fadeSec = 0.05,
): Float32Array {
  const n = Math.round(sampleRate * durationSec)
  const out = new Float32Array(n)
  const fade = Math.max(1, Math.round(fadeSec * sampleRate))
  let b0 = 0
  let b1 = 0
  let b2 = 0
  for (let i = 0; i < n; i++) {
    const white = random() * 2 - 1
    b0 = 0.99765 * b0 + white * 0.099046
    b1 = 0.963 * b1 + white * 0.2965164
    b2 = 0.57 * b2 + white * 1.0526913
    const pink = (b0 + b1 + b2 + white * 0.1848) * 0.2
    let env = 1
    if (i < fade) env = i / fade
    else if (i > n - fade) env = (n - i) / fade
    out[i] = pink * gain * env
  }
  return out
}

export function toAudioBuffer(ctx: BaseAudioContext, samples: Float32Array): AudioBuffer {
  const buf = ctx.createBuffer(1, samples.length, ctx.sampleRate)
  buf.copyToChannel(samples as Float32Array<ArrayBuffer>, 0)
  return buf
}
