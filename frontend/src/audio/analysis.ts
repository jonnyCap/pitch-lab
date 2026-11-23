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
