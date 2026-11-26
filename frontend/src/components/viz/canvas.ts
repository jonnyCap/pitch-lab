/**
 * Shared plumbing for the canvas visualisations: DPR-capped sizing, theme tokens
 * (read through a computed-style probe so any CSS colour syntax works), pausing
 * when off-screen / hidden, and a draw loop that only runs while something animates.
 */
import { onBeforeUnmount, onMounted, type Ref } from 'vue'
import { parseColor, type RGBA } from './color'

export interface Tokens {
  text: RGBA
  muted: RGBA
  line: RGBA
  border: RGBA
  accent: RGBA
  surface: RGBA
  bg: RGBA
  serif: string
  sans: string
  mono: string
}

const FALLBACK: Record<string, RGBA> = {
  '--text': [11, 11, 12, 1],
  '--muted': [95, 97, 104, 1],
  '--line': [232, 232, 228, 1],
  '--border': [220, 220, 216, 1],
  '--accent': [30, 64, 255, 1],
  '--surface': [255, 255, 255, 1],
  '--bg': [247, 247, 244, 1],
}

let probe: HTMLElement | null = null
let scratch: CanvasRenderingContext2D | null = null

/** Resolve a CSS custom property to RGBA; handles hex, rgb(), color-mix() etc. via the browser. */
export function resolveToken(name: string): RGBA {
  const fallback = FALLBACK[name] ?? [0, 0, 0, 1]
  if (typeof document === 'undefined') return fallback
  if (!probe) {
    probe = document.createElement('span')
    probe.setAttribute('aria-hidden', 'true')
    probe.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;visibility:hidden'
    document.documentElement.appendChild(probe)
  }
  probe.style.color = ''
  probe.style.color = `var(${name})`
  const computed = getComputedStyle(probe).color
  const direct = parseColor(computed)
  if (direct) return direct
  // Unusual colour space: round-trip through a canvas pixel.
  try {
    scratch ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true })
    if (scratch) {
      scratch.clearRect(0, 0, 1, 1)
      scratch.fillStyle = computed
      scratch.fillRect(0, 0, 1, 1)
      const d = scratch.getImageData(0, 0, 1, 1).data
      return [d[0]!, d[1]!, d[2]!, d[3]! / 255]
    }
  } catch {
    /* ignore */
  }
  return fallback
}

export function readTokens(): Tokens {
  const cs = getComputedStyle(document.documentElement)
  const font = (n: string, f: string) => cs.getPropertyValue(n).trim() || f
  return {
    text: resolveToken('--text'),
    muted: resolveToken('--muted'),
    line: resolveToken('--line'),
    border: resolveToken('--border'),
    accent: resolveToken('--accent'),
    surface: resolveToken('--surface'),
    bg: resolveToken('--bg'),
    serif: font('--serif', 'Georgia, serif'),
    sans: font('--sans', 'system-ui, sans-serif'),
    mono: font('--mono', 'monospace'),
  }
}

export interface DrawArgs {
  ctx: CanvasRenderingContext2D
  w: number
  h: number
  now: number
  dt: number
  t: Tokens
  reduced: boolean
}

/** Return `true` from `draw` while the scene is still animating (keeps the rAF loop alive). */
export function useCanvasViz(
  wrap: Ref<HTMLElement | null>,
  canvas: Ref<HTMLCanvasElement | null>,
  draw: (a: DrawArgs) => boolean | void,
) {
  let ctx: CanvasRenderingContext2D | null = null
  let w = 0
  let h = 0
  let dpr = 1
  let raf = 0
  let last = 0
  let visible = true
  let tokens: Tokens | null = null
  const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)')
  const scheme = matchMedia('(prefers-color-scheme: dark)')
  let ro: ResizeObserver | null = null
  let io: IntersectionObserver | null = null
  let mo: MutationObserver | null = null

  function run(now: number, dt: number): boolean {
    if (!ctx || !w || !h) return false
    tokens ??= readTokens()
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    return !!draw({ ctx, w, h, now, dt, t: tokens, reduced: reducedQuery.matches })
  }
  function tick(now: number) {
    raf = 0
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    const more = run(now, dt)
    if (more && visible) raf = requestAnimationFrame(tick)
  }
  /** Redraw soon; keeps looping while `draw` returns true. */
  function invalidate() {
    if (raf || !ctx) return
    last = performance.now()
    raf = requestAnimationFrame(tick)
  }
  function stop() {
    cancelAnimationFrame(raf)
    raf = 0
  }
  function resize() {
    const el = wrap.value
    const c = canvas.value
    if (!el || !c) return
    dpr = Math.min(2, window.devicePixelRatio || 1)
    w = el.clientWidth
    h = el.clientHeight
    c.width = Math.round(w * dpr)
    c.height = Math.round(h * dpr)
    run(performance.now(), 0)
    invalidate()
  }
  function onTheme() {
    tokens = null
    invalidate()
  }
  function setVisible(v: boolean) {
    visible = v && !document.hidden
    if (visible) invalidate()
    else stop()
  }
  const onDocVisibility = () => setVisible(!document.hidden)

  onMounted(() => {
    ctx = canvas.value!.getContext('2d')
    resize()
    ro = new ResizeObserver(resize)
    ro.observe(wrap.value!)
    io = new IntersectionObserver(([e]) => setVisible(!!e?.isIntersecting))
    io.observe(wrap.value!)
    mo = new MutationObserver(onTheme)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    scheme.addEventListener('change', onTheme)
    document.addEventListener('visibilitychange', onDocVisibility)
  })
  onBeforeUnmount(() => {
    stop()
    ro?.disconnect()
    io?.disconnect()
    mo?.disconnect()
    scheme.removeEventListener('change', onTheme)
    document.removeEventListener('visibilitychange', onDocVisibility)
  })

  return { invalidate, isVisible: () => visible, size: () => ({ w, h }) }
}
