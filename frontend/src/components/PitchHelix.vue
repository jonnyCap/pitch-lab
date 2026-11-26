<script setup lang="ts">
/**
 * Shepard's pitch helix (C3–B5) drawn in 3D on a 2D canvas: pitch class goes
 * round the circle, octave height goes up, and the floor circle is the chroma
 * circle the trainer's pitch wheel is built on. A cobalt playhead climbs the
 * helix; pointer movement tilts it; clicking a node plays that note.
 *
 * Optional: `values` (12 scores, one per pitch class) sizes/inks the nodes —
 * unscored classes are hollow — and `highlight` rings specific MIDI notes.
 * No WebGL / no deps. Pauses off-screen; static under prefers-reduced-motion.
 */
import { ref } from 'vue'
import { rgba } from './viz/color'
import { useCanvasViz, type DrawArgs } from './viz/canvas'
import { NOTE_NAMES, TAU, project, type View } from './viz/geometry'
import { playMidis } from './viz/audio'

const props = withDefaults(
  defineProps<{
    values?: (number | null)[]
    highlight?: number[]
    autoplay?: boolean
    interactive?: boolean
    caption?: string
  }>(),
  {
    values: undefined,
    highlight: () => [],
    autoplay: true,
    interactive: true,
    caption: 'Fig. 1 — Pitch helix · chroma × height',
  },
)

const LO = 48 // C3
const N = 36
const TILT = 0.32

const wrap = ref<HTMLDivElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)

let yaw = -0.35
let pointerYaw = 0
let pointerTilt = 0
let curYaw = 0
let curTilt = 0
let head = 0 // playhead position along the helix (node units)
let hover = -1
let view: View = { yaw: 0, tilt: 0, cx: 0, cy: 0, unit: 1 }
const flashes = new Map<number, number>() // node → start time (ms)

function setView(w: number, h: number) {
  view = {
    yaw: yaw + curYaw,
    tilt: TILT + curTilt,
    cx: w / 2,
    cy: h * 0.47,
    unit: Math.min(w, h) * 0.27,
  }
}
function nodeWorld(i: number): [number, number, number] {
  const th = (i / 12) * TAU
  return [Math.sin(th), (i / (N - 1) - 0.5) * 2.1, Math.cos(th)]
}
const nodeAt = (i: number) => project(view, ...nodeWorld(i))
const score = (i: number): number | null | undefined => props.values?.[i % 12]
const highlighted = () => new Set(props.highlight.map((m) => (((m - LO) % N) + N) % N))

function draw({ ctx, w, h, now, dt, t, reduced }: DrawArgs) {
  const animate = !reduced
  if (animate) {
    yaw += dt * 0.22
    curYaw += (pointerYaw - curYaw) * Math.min(1, dt * 4)
    curTilt += (pointerTilt - curTilt) * Math.min(1, dt * 4)
    if (props.autoplay) {
      const before = Math.floor(head)
      head = (head + dt * 2.2) % (N - 1)
      const after = Math.floor(head)
      if (after !== before) flashes.set(after, now)
    }
  } else if (props.autoplay && head === 0) head = 7
  setView(w, h)
  const hasValues = !!props.values
  const marks = highlighted()

  // Floor: the chroma circle with 12 ticks.
  const floorY = -1.45
  ctx.lineWidth = 1
  ctx.strokeStyle = rgba(t.border)
  ctx.beginPath()
  for (let k = 0; k <= 72; k++) {
    const th = (k / 72) * TAU
    const p = project(view, Math.sin(th) * 1.08, floorY, Math.cos(th) * 1.08)
    if (k) ctx.lineTo(p.x, p.y)
    else ctx.moveTo(p.x, p.y)
  }
  ctx.stroke()
  for (let pc = 0; pc < 12; pc++) {
    const th = (pc / 12) * TAU
    const a = project(view, Math.sin(th) * 1.02, floorY, Math.cos(th) * 1.02)
    const b = project(view, Math.sin(th) * 1.14, floorY, Math.cos(th) * 1.14)
    ctx.strokeStyle =
      props.autoplay && pc === Math.floor(head) % 12 ? rgba(t.accent) : rgba(t.muted, 0.6)
    ctx.lineWidth = pc === 0 ? 2 : 1
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
  }

  // Octave axis.
  const top = project(view, 0, 1.2, 0)
  const bot = project(view, 0, floorY, 0)
  ctx.setLineDash([2, 4])
  ctx.strokeStyle = rgba(t.muted, 0.5)
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
    ctx.strokeStyle = rgba(t.text, 0.18 + 0.5 * ((depth + 1) / 2))
    ctx.lineWidth = 0.6 + 0.9 * ((depth + 1) / 2)
    ctx.beginPath()
    ctx.moveTo(prev.x, prev.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    prev = p
  }

  // Playhead trail.
  if (props.autoplay) {
    const t0 = Math.max(0, head - 3.5)
    prev = nodeAt(t0)
    for (let k = 1; k <= 28; k++) {
      const u = t0 + ((head - t0) * k) / 28
      const p = nodeAt(u)
      ctx.strokeStyle = rgba(t.accent, k / 28)
      ctx.lineWidth = 1 + 2.2 * (k / 28) * p.s
      ctx.beginPath()
      ctx.moveTo(prev.x, prev.y)
      ctx.lineTo(p.x, p.y)
      ctx.stroke()
      prev = p
    }
  }

  // Nodes, back to front.
  const nodes = Array.from({ length: N }, (_, i) => ({ i, p: nodeAt(i) })).sort(
    (a, b) => a.p.z - b.p.z,
  )
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  let animating = false
  for (const { i, p } of nodes) {
    const front = (p.z + 1) / 2
    const isC = i % 12 === 0
    const isHover = i === hover
    const v = hasValues ? score(i) : undefined
    const scored = typeof v === 'number'
    const base = hasValues ? (scored ? 1.8 + 5 * v : 2.8) : isC ? 3.4 : 2.2
    const r = base * p.s + (isHover ? 2 : 0)
    const flash = flashes.get(i)
    if (flash !== undefined) {
      const age = (now - flash) / 700
      if (age >= 1) flashes.delete(i)
      else {
        animating = true
        ctx.strokeStyle = rgba(t.accent, 1 - age)
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(p.x, p.y, r + age * 14, 0, TAU)
        ctx.stroke()
      }
    }
    const lit = isHover || flash !== undefined
    if (hasValues && !scored && !lit) {
      ctx.strokeStyle = rgba(t.text, 0.25 + 0.4 * front)
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(p.x, p.y, r, 0, TAU)
      ctx.stroke()
    } else {
      const ink = hasValues && scored ? 0.25 + 0.75 * v : 1
      ctx.fillStyle = lit ? rgba(t.accent) : rgba(t.text, (0.3 + 0.7 * front) * ink)
      ctx.beginPath()
      ctx.arc(p.x, p.y, r, 0, TAU)
      ctx.fill()
    }
    if (marks.has(i)) {
      ctx.strokeStyle = rgba(t.accent)
      ctx.lineWidth = 1.6
      ctx.beginPath()
      ctx.arc(p.x, p.y, r + 4 * p.s, 0, TAU)
      ctx.stroke()
    }
    if (isC || isHover || marks.has(i)) {
      let label = `${NOTE_NAMES[i % 12]}${Math.floor((LO + i) / 12) - 1}`
      if (isHover && scored) label += ` · ${Math.round(v * 100)}%`
      ctx.font = `${isHover ? 600 : 500} ${Math.round(10 * p.s)}px ${t.mono}`
      ctx.fillStyle = isHover || marks.has(i) ? rgba(t.accent) : rgba(t.muted, 0.35 + 0.65 * front)
      ctx.fillText(label, p.x + (p.x > w / 2 ? 1 : -1) * (isHover && scored ? 30 : 18) * p.s, p.y)
    }
  }

  // Playhead.
  if (props.autoplay) {
    const hp = nodeAt(head)
    ctx.fillStyle = rgba(t.accent)
    ctx.shadowColor = rgba(t.accent, 0.8)
    ctx.shadowBlur = 12
    ctx.beginPath()
    ctx.arc(hp.x, hp.y, 4.2 * hp.s, 0, TAU)
    ctx.fill()
    ctx.shadowBlur = 0
  }
  return animate || animating
}

const { invalidate } = useCanvasViz(wrap, canvas, draw)

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
  if (!props.interactive) return
  const rect = canvas.value!.getBoundingClientRect()
  const nx = (e.clientX - rect.left) / rect.width - 0.5
  const ny = (e.clientY - rect.top) / rect.height - 0.5
  pointerYaw = nx * 0.6
  pointerTilt = ny * 0.35
  hover = e.pointerType === 'mouse' ? nearest(e) : -1
  canvas.value!.style.cursor = hover >= 0 ? 'pointer' : 'default'
  invalidate()
}
function onLeave() {
  pointerYaw = 0
  pointerTilt = 0
  hover = -1
  invalidate()
}
async function onDown(e: PointerEvent) {
  if (!props.interactive) return
  const i = nearest(e)
  if (i < 0) return
  flashes.set(i, performance.now())
  invalidate()
  await playMidis([LO + i])
}
</script>

<template>
  <figure class="helix">
    <div ref="wrap" class="stage">
      <canvas
        ref="canvas"
        role="img"
        :aria-label="`Pitch helix: the twelve pitch classes repeat around a circle while each octave climbs higher.${interactive ? ' Click a note to hear it.' : ''}${values ? ' Larger, darker nodes are pitches you identify more accurately; hollow ones have no score yet.' : ''}`"
        @pointermove="onMove"
        @pointerleave="onLeave"
        @pointerdown="onDown"
      />
    </div>
    <figcaption v-if="caption" class="fig-caption">{{ caption }}</figcaption>
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
