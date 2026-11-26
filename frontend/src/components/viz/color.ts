/** Robust CSS colour parsing for canvas drawing (theme tokens are not always 6-digit hex). */

/** r, g, b in 0..255, a in 0..1. */
export type RGBA = [number, number, number, number]

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

export function parseColor(input: string): RGBA | null {
  const s = input.trim().toLowerCase()
  if (!s) return null
  if (s[0] === '#') {
    let h = s.slice(1)
    if (!/^[0-9a-f]+$/.test(h)) return null
    if (h.length === 3 || h.length === 4) {
      h = h
        .split('')
        .map((c) => c + c)
        .join('')
    }
    if (h.length !== 6 && h.length !== 8) return null
    const n = parseInt(h.slice(0, 6), 16)
    const a = h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1
    return [n >> 16, (n >> 8) & 255, n & 255, a]
  }
  const num = '([\\d.]+)(%?)'
  const fn = new RegExp(
    `^(?:rgba?|color\\(srgb)\\(?\\s*${num}[\\s,]+${num}[\\s,]+${num}(?:\\s*[,/]\\s*${num})?\\s*\\)$`,
  ).exec(s)
  if (!fn) return null
  const isSrgb = s.startsWith('color(')
  const ch = (v: string, pct: string) => {
    const x = parseFloat(v)
    if (pct) return clamp(Math.round((x / 100) * 255), 0, 255)
    return clamp(Math.round(isSrgb ? x * 255 : x), 0, 255)
  }
  const a =
    fn[7] === undefined ? 1 : clamp(fn[8] ? parseFloat(fn[7]) / 100 : parseFloat(fn[7]), 0, 1)
  return [ch(fn[1]!, fn[2]!), ch(fn[3]!, fn[4]!), ch(fn[5]!, fn[6]!), a]
}

/** `rgba()` string with an extra alpha multiplier. */
export function rgba(c: RGBA, alpha = 1): string {
  return `rgba(${c[0]},${c[1]},${c[2]},${clamp(c[3] * alpha, 0, 1).toFixed(3)})`
}

/** Linear blend of two colours (t = 0 → a, t = 1 → b). */
export function blend(a: RGBA, b: RGBA, t: number): RGBA {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
    a[3] + (b[3] - a[3]) * t,
  ]
}
