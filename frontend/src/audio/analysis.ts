/**
 * Fundamental-frequency estimation via the normalised square difference
 * function (McLeod & Wyvill 2005, "A smarter way to find pitch") with parabolic
 * peak interpolation. Used to verify stimulus tuning in tests and, later, for
 * microphone pitch production tasks.
 */

export function estimateF0(
  samples: Float32Array,
  sampleRate: number,
  minHz = 50,
  maxHz = 4200,
  threshold = 0.9,
): number | null {
  const n = samples.length
  const minLag = Math.max(2, Math.floor(sampleRate / maxHz))
  const maxLag = Math.min(n - 1, Math.ceil(sampleRate / minHz))
  const nsdf = new Float64Array(maxLag + 2)

  for (let tau = minLag - 1; tau <= maxLag + 1 && tau < n; tau++) {
    let acf = 0
    let m = 0
    for (let i = 0; i < n - tau; i++) {
      const a = samples[i]!
      const b = samples[i + tau]!
      acf += a * b
      m += a * a + b * b
    }
    nsdf[tau] = m > 0 ? (2 * acf) / m : 0
  }

  // Global max (for the threshold), then the first local max above threshold * max.
  let globalMax = 0
  for (let tau = minLag; tau <= maxLag; tau++) globalMax = Math.max(globalMax, nsdf[tau]!)
  if (globalMax <= 0) return null

  for (let tau = minLag; tau <= maxLag; tau++) {
    const v = nsdf[tau]!
    if (v >= threshold * globalMax && v >= nsdf[tau - 1]! && v >= nsdf[tau + 1]!) {
      const a = nsdf[tau - 1]!
      const b = v
      const c = nsdf[tau + 1]!
      const denom = a - 2 * b + c
      const shift = denom !== 0 ? (0.5 * (a - c)) / denom : 0
      return sampleRate / (tau + shift)
    }
  }
  return null
}

/**
 * Perceived (central) pitch of a sustained tone as a fractional MIDI number:
 * the median of frame-wise f0 estimates over [startSec, endSec). Robust to
 * vibrato (which swings ±10–20 cents around the centre) and to occasional
 * octave errors in single frames (frames not matching the modal note are dropped).
 */
export function medianPitchMidi(
  samples: Float32Array,
  sampleRate: number,
  opts: { startSec?: number; endSec?: number; window?: number; hop?: number } = {},
): number | null {
  const { startSec = 0.15, endSec = 0.95, window = 4096, hop = 1024 } = opts
  const start = Math.round(startSec * sampleRate)
  const end = Math.min(samples.length, Math.round(endSec * sampleRate))
  const frames: number[] = []
  for (let i = start; i + window <= end; i += hop) {
    const f0 = estimateF0(samples.subarray(i, i + window), sampleRate, 40, 4500)
    if (f0) frames.push(69 + 12 * Math.log2(f0 / 440))
  }
  if (frames.length === 0) return null
  const counts = new Map<number, number>()
  for (const m of frames) counts.set(Math.round(m), (counts.get(Math.round(m)) ?? 0) + 1)
  const mode = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0]
  const kept = frames.filter((m) => Math.abs(m - mode) < 0.75).sort((a, b) => a - b)
  const mid = Math.floor(kept.length / 2)
  return kept.length % 2 ? kept[mid]! : (kept[mid - 1]! + kept[mid]!) / 2
}
