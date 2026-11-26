/**
 * Imperative, silent DOM effects. All are no-ops under reduced motion and very
 * short in E2E. Nothing here ever plays a sound; `haptic` only vibrates.
 *
 *   popText(el, '+3', 'ok')      // floating label that rises & fades
 *   burst(el)                    // small confetti/ink-spark canvas burst
 *   shake(el); pulse(el, 'bad')  // WAAPI feedback on an element
 *   haptic('ok')                 // feedback levels only!
 */
import { dur, prefersReducedMotion } from './motion'

export type Anchor = Element | { x: number; y: number }
type Tone = 'accent' | 'ok' | 'bad' | 'ink'

/** Viewport-space centre point of an anchor. */
export function anchorPoint(anchor: Anchor): { x: number; y: number } {
  if ('getBoundingClientRect' in anchor) {
    const r = anchor.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  }
  return { x: anchor.x, y: anchor.y }
}

const TONE_VAR: Record<Tone, string> = {
  accent: '--accent-ink',
  ok: '--ok',
  bad: '--bad',
  ink: '--text',
}

/** Resolve a CSS custom property to a concrete color string. */
export function cssColor(name: string, fallback: string): string {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
    return v || fallback
  } catch {
    return fallback
  }
}

/** Deterministic-ish particle spawn; `rand` injectable for tests. */
export interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  rot: number
  vr: number
  color: string
}

export function makeParticles(
  origin: { x: number; y: number },
  count: number,
  colors: string[],
  rand: () => number = Math.random,
): Particle[] {
  const n = Math.max(0, Math.min(80, Math.floor(count)))
  const palette = colors.length ? colors : ['#1E40FF']
  return Array.from({ length: n }, (_, i) => {
    const angle = -Math.PI / 2 + (rand() - 0.5) * Math.PI * 1.3
    const speed = 3 + rand() * 6
    return {
      x: origin.x,
      y: origin.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 3 + rand() * 4,
      rot: rand() * Math.PI,
      vr: (rand() - 0.5) * 0.4,
      color: palette[i % palette.length]!,
    }
  })
}

let layer: HTMLElement | null = null
function getLayer(): HTMLElement {
  if (layer && layer.isConnected) return layer
  layer = document.createElement('div')
  layer.setAttribute('aria-hidden', 'true')
  layer.dataset.fxLayer = ''
  layer.style.cssText =
    'position:fixed;inset:0;pointer-events:none;z-index:1000;overflow:hidden;contain:layout paint'
  document.body.appendChild(layer)
  return layer
}

export function popText(anchor: Anchor, text: string, tone: Tone = 'accent'): void {
  if (typeof document === 'undefined' || prefersReducedMotion()) return
  const { x, y } = anchorPoint(anchor)
  const el = document.createElement('span')
  el.textContent = text
  el.style.cssText = `position:absolute;left:${x}px;top:${y}px;translate:-50% -50%;font:400 1.75rem/1 var(--display);letter-spacing:-0.01em;white-space:nowrap;color:var(${TONE_VAR[tone]});will-change:transform,opacity`
  getLayer().appendChild(el)
  const d = dur(700)
  const done = () => el.remove()
  if (typeof el.animate !== 'function' || d === 0) return done()
  const a = el.animate(
    [
      { transform: 'translateY(6px) scale(0.8)', opacity: 0 },
      { transform: 'translateY(-10px) scale(1)', opacity: 1, offset: 0.2 },
      { transform: 'translateY(-44px) scale(1)', opacity: 0 },
    ],
    { duration: d, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' },
  )
  a.onfinish = done
  a.oncancel = done
}

export function burst(anchor: Anchor, opts: { count?: number; colors?: string[] } = {}): void {
  if (typeof document === 'undefined' || prefersReducedMotion()) return
  const total = dur(1100)
  if (total === 0) return
  const origin = anchorPoint(anchor)
  const colors = opts.colors ?? [
    cssColor('--accent', '#1E40FF'),
    cssColor('--text', '#0B0B0C'),
    cssColor('--ok', '#0B7A3E'),
  ]
  const parts = makeParticles(origin, opts.count ?? 48, colors)
  const canvas = document.createElement('canvas')
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const w = window.innerWidth
  const h = window.innerHeight
  canvas.width = w * dpr
  canvas.height = h * dpr
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%'
  getLayer().appendChild(canvas)
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas.remove()
  ctx.scale(dpr, dpr)
  const t0 = performance.now()
  const frame = (now: number) => {
    const t = (now - t0) / total
    if (t >= 1) return canvas.remove()
    ctx.clearRect(0, 0, w, h)
    ctx.globalAlpha = Math.min(1, (1 - t) * 2.2)
    for (const p of parts) {
      p.vy += 0.22
      p.vx *= 0.985
      p.x += p.vx
      p.y += p.vy
      p.rot += p.vr
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rot)
      ctx.fillStyle = p.color
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
      ctx.restore()
    }
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}

export function shake(el: Element): void {
  const d = dur(360)
  if (d === 0 || typeof el.animate !== 'function') return
  el.animate(
    [
      { transform: 'translateX(0)' },
      { transform: 'translateX(-6px)', offset: 0.18 },
      { transform: 'translateX(5px)', offset: 0.4 },
      { transform: 'translateX(-3px)', offset: 0.62 },
      { transform: 'translateX(2px)', offset: 0.82 },
      { transform: 'translateX(0)' },
    ],
    { duration: d, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
  )
}

export function pulse(el: Element, tone: 'ok' | 'bad' | 'accent' = 'accent'): void {
  const d = dur(480)
  if (d === 0 || typeof el.animate !== 'function') return
  const color = cssColor(tone === 'accent' ? '--accent' : `--${tone}`, '#1E40FF')
  el.animate(
    [
      { boxShadow: `0 0 0 0 ${color}`, transform: 'scale(1)' },
      { boxShadow: `0 0 0 8px transparent`, transform: 'scale(1.04)', offset: 0.5 },
      { boxShadow: `0 0 0 0 transparent`, transform: 'scale(1)' },
    ],
    { duration: d, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
  )
}

const PATTERNS: Record<'ok' | 'bad' | 'tap', number | number[]> = {
  ok: 12,
  bad: [18, 40, 18],
  tap: 6,
}

export function haptic(kind: 'ok' | 'bad' | 'tap'): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(PATTERNS[kind])
    }
  } catch {
    /* ignore */
  }
}
