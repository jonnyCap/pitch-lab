<script setup lang="ts">
/**
 * Shepard's pitch helix (C3–B5) drawn in 3D on a 2D canvas: pitch class goes
 * round the circle, octave height goes up, and the floor ellipse is the chroma
 * circle the trainer's pitch wheel is built on. A playhead climbs the helix;
 * pointer movement tilts it; clicking a node plays that note.
 * No WebGL / no deps. Pauses off-screen; static under prefers-reduced-motion.
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'

const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']
const LO = 48 // C3
const N = 36
const TAU = Math.PI * 2

const wrap = ref<HTMLDivElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)

let ctx: CanvasRenderingContext2D | null = null
let w = 0
let h = 0
let dpr = 1
let raf = 0
let last = 0
let visible = true
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches

let yaw = -0.35
const TILT = 0.32
let pointerYaw = 0
let pointerTilt = 0
let curYaw = 0
let curTilt = 0
let head = 0 // playhead position along the helix (node units)
let hover = -1
const flashes = new Map<number, number>() // node → start time (ms)
let colors = {
  text: '#161616',
  muted: '#6b6a63',
  line: '#d8d6ce',
  accent: '#ff4f00',
  mono: 'monospace',
}

function readColors() {
  const cs = getComputedStyle(document.documentElement)
  const v = (n: string, f: string) => cs.getPropertyValue(n).trim() || f
  colors = {
    text: v('--text', colors.text),
    muted: v('--muted', colors.muted),
    line: v('--border', colors.line),
    accent: v('--accent', colors.accent),
    mono: v('--mono', 'monospace'),
  }
  if (!raf) draw(performance.now())
}

interface P {
  x: number
  y: number
  z: number
  s: number
}

/** World → screen for a (fractional) node index, or an explicit point. */
function project(px: number, py: number, pz: number): P {
  const a = yaw + curYaw
  const t = TILT + curTilt
  const x = px * Math.cos(a) + pz * Math.sin(a)
  const z0 = -px * Math.sin(a) + pz * Math.cos(a)
  const y = py * Math.cos(t) - z0 * Math.sin(t)
  const z = py * Math.sin(t) + z0 * Math.cos(t)
  const f = 3.2
  const s = f / (f - z)
  const unit = Math.min(w, h) * 0.27
  return { x: w / 2 + x * s * unit, y: h * 0.47 - y * s * unit, z, s }
}
function nodeWorld(i: number): [number, number, number] {
  const th = (i / 12) * TAU
  return [Math.sin(th), (i / (N - 1) - 0.5) * 2.1, Math.cos(th)]
}
const nodeAt = (i: number) => project(...nodeWorld(i))

/** Theme tokens are 6-digit hex; turn one into rgba with the given alpha. */
function mix(c: string, alpha: number) {
  const n = parseInt(c.slice(1, 7), 16)
  const a = Math.max(0, Math.min(1, alpha)).toFixed(3)
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`
}

function draw(now: number) {
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)
  ctx.lineCap = 'round'

  // Floor: the chroma circle with 12 ticks.
  const floorY = -1.45
  ctx.lineWidth = 1
  ctx.strokeStyle = mix(colors.line, 1)
  ctx.beginPath()
  for (let k = 0; k <= 72; k++) {
    const th = (k / 72) * TAU
    const p = project(Math.sin(th) * 1.08, floorY, Math.cos(th) * 1.08)
    if (k) ctx.lineTo(p.x, p.y)
    else ctx.moveTo(p.x, p.y)
  }
  ctx.stroke()
  for (let pc = 0; pc < 12; pc++) {
    const th = (pc / 12) * TAU
    const a = project(Math.sin(th) * 1.02, floorY, Math.cos(th) * 1.02)
    const b = project(Math.sin(th) * 1.14, floorY, Math.cos(th) * 1.14)
    ctx.strokeStyle = pc === Math.floor(head) % 12 ? colors.accent : mix(colors.muted, 0.6)
    ctx.lineWidth = pc === 0 ? 2 : 1
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
  }

  // Octave axis.
  const top = project(0, 1.2, 0)
  const bot = project(0, floorY, 0)
  ctx.setLineDash([2, 4])
  ctx.strokeStyle = mix(colors.muted, 0.5)
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(top.x, top.y)
  ctx.lineTo(bot.x, bot.y)
  ctx.stroke()
  ctx.setLineDash([])

  // Helix, segment by segment so depth can fade the far side.
  const STEPS = (N - 1) * 6
  let prev = nodeAt(0)
  for (let k = 1; k <= STEPS; k++) {
    const p = nodeAt((k / STEPS) * (N - 1))
    const depth = (p.z + prev.z) / 2
    ctx.strokeStyle = mix(colors.text, 0.18 + 0.5 * ((depth + 1) / 2))
    ctx.lineWidth = 0.6 + 0.9 * ((depth + 1) / 2)
    ctx.beginPath()
    ctx.moveTo(prev.x, prev.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    prev = p
  }

  // Playhead trail.
  const TRAIL = 3.5
  const t0 = Math.max(0, head - TRAIL)
  prev = nodeAt(t0)
  for (let k = 1; k <= 28; k++) {
    const u = t0 + ((head - t0) * k) / 28
    const p = nodeAt(u)
    ctx.strokeStyle = mix(colors.accent, k / 28)
    ctx.lineWidth = 1 + 2.2 * (k / 28) * p.s
    ctx.beginPath()
    ctx.moveTo(prev.x, prev.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    prev = p
  }

  // Nodes, back to front.
  const nodes = Array.from({ length: N }, (_, i) => ({ i, p: nodeAt(i) })).sort(
    (a, b) => a.p.z - b.p.z,
  )
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (const { i, p } of nodes) {
    const front = (p.z + 1) / 2
    const isC = i % 12 === 0
    const isHover = i === hover
    const r = (isC ? 3.4 : 2.2) * p.s + (isHover ? 2 : 0)
    const flash = flashes.get(i)
    if (flash !== undefined) {
      const age = (now - flash) / 700
      if (age >= 1) flashes.delete(i)
      else {
        ctx.strokeStyle = mix(colors.accent, 1 - age)
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(p.x, p.y, r + age * 14, 0, TAU)
        ctx.stroke()
      }
    }
    ctx.fillStyle =
      isHover || flash !== undefined ? colors.accent : mix(colors.text, 0.3 + 0.7 * front)
    ctx.beginPath()
    ctx.arc(p.x, p.y, r, 0, TAU)
    ctx.fill()
    if (isC || isHover) {
      const label = `${NAMES[i % 12]}${Math.floor((LO + i) / 12) - 1}`
      ctx.font = `${isHover ? 600 : 500} ${Math.round(10 * p.s)}px ${colors.mono}`
      ctx.fillStyle = isHover ? colors.accent : mix(colors.muted, 0.35 + 0.65 * front)
      ctx.fillText(label, p.x + (p.x > w / 2 ? 1 : -1) * 18 * p.s, p.y)
    }
  }

  // Playhead.
  const hp = nodeAt(head)
  ctx.fillStyle = colors.accent
  ctx.shadowColor = colors.accent
  ctx.shadowBlur = 12
  ctx.beginPath()
  ctx.arc(hp.x, hp.y, 4.2 * hp.s, 0, TAU)
  ctx.fill()
  ctx.shadowBlur = 0
}

function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000)
  last = now
  yaw += dt * 0.22
  curYaw += (pointerYaw - curYaw) * Math.min(1, dt * 4)
  curTilt += (pointerTilt - curTilt) * Math.min(1, dt * 4)
  const before = Math.floor(head)
  head = (head + dt * 2.2) % (N - 1)
  const after = Math.floor(head)
  if (after !== before) flashes.set(after, now)
  draw(now)
  raf = visible ? requestAnimationFrame(frame) : 0
}

function start() {
  if (reduced || raf || !visible) return
  last = performance.now()
  raf = requestAnimationFrame(frame)
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
  draw(performance.now())
}

function nearest(e: PointerEvent): number {
  const rect = canvas.value!.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  let best = -1
  let bestD = 16 * 16
  let bestZ = -Infinity
  for (let i = 0; i < N; i++) {
    const p = nodeAt(i)
    const d = (p.x - x) ** 2 + (p.y - y) ** 2
    if (d < bestD || (d < 16 * 16 && p.z > bestZ && d - bestD < 40)) {
      best = i
      bestD = d
      bestZ = p.z
    }
  }
  return best
}

function onMove(e: PointerEvent) {
  const rect = canvas.value!.getBoundingClientRect()
  const nx = (e.clientX - rect.left) / rect.width - 0.5
  const ny = (e.clientY - rect.top) / rect.height - 0.5
  pointerYaw = nx * 0.6
  pointerTilt = ny * 0.35
  hover = e.pointerType === 'mouse' ? nearest(e) : -1
  canvas.value!.style.cursor = hover >= 0 ? 'pointer' : 'default'
  if (!raf) draw(performance.now())
}
function onLeave() {
  pointerYaw = 0
  pointerTilt = 0
  hover = -1
  if (!raf) draw(performance.now())
}
async function onDown(e: PointerEvent) {
  const i = nearest(e)
  if (i < 0) return
  flashes.set(i, performance.now())
  if (!raf) draw(performance.now())
  const [{ audio }, { learnTimbre }] = await Promise.all([
    import('@/audio/engine'),
    import('@/learn/sound'),
  ])
  await audio.unlock()
  void audio.playTone(learnTimbre(), LO + i)
}

let ro: ResizeObserver | null = null
let io: IntersectionObserver | null = null
let mo: MutationObserver | null = null
const scheme = matchMedia('(prefers-color-scheme: dark)')
function onVisibility() {
  visible = !document.hidden
  if (visible) start()
  else stop()
}

onMounted(() => {
  ctx = canvas.value!.getContext('2d')
  readColors()
  resize()
  ro = new ResizeObserver(resize)
  ro.observe(wrap.value!)
  io = new IntersectionObserver(([entry]) => {
    visible = !!entry?.isIntersecting && !document.hidden
    if (visible) start()
    else stop()
  })
  io.observe(wrap.value!)
  mo = new MutationObserver(readColors)
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  scheme.addEventListener('change', readColors)
  document.addEventListener('visibilitychange', onVisibility)
  start()
})
onBeforeUnmount(() => {
  stop()
  ro?.disconnect()
  io?.disconnect()
  mo?.disconnect()
  scheme.removeEventListener('change', readColors)
  document.removeEventListener('visibilitychange', onVisibility)
})
</script>

<template>
  <figure class="helix">
    <div ref="wrap" class="stage">
      <canvas
        ref="canvas"
        role="img"
        aria-label="Pitch helix: the twelve pitch classes repeat around a circle while each octave climbs higher. Click a note to hear it."
        @pointermove="onMove"
        @pointerleave="onLeave"
        @pointerdown="onDown"
      />
    </div>
    <figcaption class="label">Fig. 1 — Pitch helix · chroma × height</figcaption>
  </figure>
</template>

<style scoped>
.helix {
  width: 100%;
  margin: 0;
}
.stage {
  width: 100%;
  aspect-ratio: 1;
}
canvas {
  display: block;
  width: 100%;
  height: 100%;
  touch-action: pan-y;
}
figcaption {
  text-align: center;
  margin-top: -0.5rem;
}
</style>
