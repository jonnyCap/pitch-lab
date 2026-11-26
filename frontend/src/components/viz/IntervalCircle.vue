<script setup lang="ts">
/**
 * An interval as a walk round the chroma circle: a tilted 3D ring of the twelve
 * pitch classes, two notes, and an arc that counts the semitones between them
 * (rising a little as it goes, so a full octave spirals back above its start).
 * Tap a note — or use the buttons — to hear it.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { rgba } from './color'
import { useCanvasViz, type DrawArgs } from './canvas'
import {
  NOTE_NAMES,
  TAU,
  easeInOut,
  intervalName,
  intervalShort,
  noteLabel,
  project,
  ringPoint,
  type View,
} from './geometry'
import { playMidis } from './audio'

const props = withDefaults(defineProps<{ lower: number; upper: number; caption?: string }>(), {
  caption: '',
})

const semis = computed(() => Math.max(0, props.upper - props.lower))
const LIFT = 0.45 // total height gained over an octave
const label = computed(
  () =>
    `${noteLabel(props.lower)} up to ${noteLabel(props.upper)}: a ${intervalName(semis.value)}, ${semis.value} semitone${semis.value === 1 ? '' : 's'}.`,
)

const wrap = ref<HTMLDivElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const readout = ref(0) // semitones counted so far (for the live text)

let yaw = 0.35
const TILT = 0.95
let pointerYaw = 0
let curYaw = 0
let prog = 1 // 0..1 how much of the arc is drawn
let animFrom = 0
let animStart = 0
let animLen = 0
let view: View = { yaw: 0, tilt: 0, cx: 0, cy: 0, unit: 1 }
const flash = new Map<number, number>()

function startArc(
  now = performance.now(),
  reduced = matchMedia('(prefers-reduced-motion: reduce)').matches,
) {
  if (reduced) {
    prog = 1
    readout.value = semis.value
    invalidate()
    return
  }
  prog = 0
  readout.value = 0
  animFrom = now
  animStart = 250
  animLen = Math.max(500, semis.value * 110)
  invalidate()
}

const noteHeight = (k: number) => (k / 12) * LIFT // k semitones above the lower note
const pc = (k: number) => (((props.lower + k) % 12) + 12) % 12
const at = (k: number, extra = 0) => ringPoint(pc(k), 1, noteHeight(k) + extra)

function draw({ ctx, w, h, now, dt, t, reduced }: DrawArgs) {
  if (!reduced) {
    yaw += dt * 0.12
    curYaw += (pointerYaw - curYaw) * Math.min(1, dt * 4)
  }
  view = {
    yaw: yaw + curYaw,
    tilt: TILT,
    cx: w / 2,
    cy: h * 0.5,
    unit: Math.min(w * 0.36, h * 0.52),
  }
  // Keep C at the front: rotate so the lower note stays readable, the ring spins slowly.
  const P = (p: [number, number, number]) => project(view, ...p)

  // Arc progress.
  let animating = false
  if (prog < 1) {
    const e = (now - animFrom - animStart) / animLen
    prog = Math.max(0, Math.min(1, e))
    animating = prog < 1
    const counted = Math.round(easeInOut(prog) * semis.value)
    if (counted !== readout.value) {
      readout.value = counted
      flash.set(counted, now)
    }
  }
  const shown = easeInOut(prog) * semis.value

  // Ring (hairline) and 12 chroma ticks with names.
  ctx.lineWidth = 1
  ctx.strokeStyle = rgba(t.border)
  ctx.beginPath()
  for (let k = 0; k <= 96; k++) {
    const th = (k / 96) * TAU
    const p = project(view, Math.sin(th), 0, Math.cos(th))
    if (k) ctx.lineTo(p.x, p.y)
    else ctx.moveTo(p.x, p.y)
  }
  ctx.stroke()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const fs = Math.max(10, Math.min(13, w / 30))
  for (let n = 0; n < 12; n++) {
    const a = P(ringPoint(n, 0.94, 0))
    const b = P(ringPoint(n, 1.06, 0))
    ctx.strokeStyle = rgba(t.muted, n === 0 ? 0.9 : 0.5)
    ctx.lineWidth = n === 0 ? 1.6 : 1
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
    // The two played notes carry their own labels; don't print the ring name under them.
    if (n === pc(0) || n === pc(semis.value)) continue
    const l = P(ringPoint(n, 1.24, 0))
    const front = (l.z + 1.2) / 2.4
    ctx.font = `${n === 0 ? 600 : 400} ${fs}px ${t.sans}`
    ctx.fillStyle = rgba(t.muted, 0.45 + 0.55 * Math.max(0, Math.min(1, front)))
    ctx.fillText(NOTE_NAMES[n]!, l.x, l.y)
  }

  // Stem + floor shadow for the upper note's height.
  const lowTop = P(at(0))
  const base = P(ringPoint(pc(0), 1, 0))
  ctx.strokeStyle = rgba(t.muted, 0.5)
  ctx.setLineDash([2, 3])
  ctx.beginPath()
  ctx.moveTo(base.x, base.y)
  ctx.lineTo(lowTop.x, lowTop.y)
  ctx.stroke()
  ctx.setLineDash([])

  // The arc: a helix segment from the lower to the upper note, ink track + cobalt progress.
  const seg = Math.max(8, Math.ceil(semis.value * 6))
  const pathTo = (upTo: number, color: string, width: number) => {
    ctx.strokeStyle = color
    ctx.lineWidth = width
    ctx.beginPath()
    const steps = Math.max(1, Math.ceil((upTo / Math.max(1, semis.value)) * seg))
    for (let i = 0; i <= steps; i++) {
      const k = (i / steps) * upTo
      const th = ((pc(0) + k) / 12) * TAU
      const p = project(view, Math.sin(th), noteHeight(k), Math.cos(th))
      if (i) ctx.lineTo(p.x, p.y)
      else ctx.moveTo(p.x, p.y)
    }
    ctx.stroke()
  }
  if (semis.value > 0) {
    ctx.setLineDash([1, 5])
    pathTo(semis.value, rgba(t.text, 0.35), 1.2)
    ctx.setLineDash([])
    if (shown > 0) pathTo(shown, rgba(t.accent), 2.6)
  }

  // Semitone beads along the arc.
  for (let k = 1; k < semis.value; k++) {
    const p = P(at(k))
    const reached = shown >= k - 0.001
    const f = flash.get(k)
    let boost = 0
    if (f !== undefined) {
      const age = (now - f) / 450
      if (age >= 1) flash.delete(k)
      else {
        boost = 1 - age
        animating = true
      }
    }
    ctx.fillStyle = reached ? rgba(t.accent) : rgba(t.text, 0.35)
    ctx.beginPath()
    ctx.arc(p.x, p.y, (reached ? 2.4 : 1.8) * p.s + boost * 2.5, 0, TAU)
    ctx.fill()
  }

  // The two notes.
  const ends: [number, string][] = [
    [0, noteLabel(props.lower)],
    [semis.value, noteLabel(props.upper)],
  ]
  ends.forEach(([k, name], idx) => {
    const p = P(at(k))
    const lit = idx === 0 || prog >= 1
    ctx.fillStyle = lit ? rgba(t.text) : rgba(t.surface)
    ctx.strokeStyle = rgba(t.text)
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(p.x, p.y, 6.5 * p.s, 0, TAU)
    ctx.fill()
    ctx.stroke()
    ctx.font = `600 ${fs + 1}px ${t.mono}`
    ctx.fillStyle = rgba(t.text)
    const up = P(at(k, 0.28))
    ctx.fillText(name, up.x, up.y - 4)
  })

  // Centre readout.
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = rgba(t.text)
  ctx.font = `${Math.round(Math.min(w, h) * 0.17)}px ${t.display}`
  const cy = view.cy + Math.min(w, h) * 0.05
  ctx.fillText(String(readout.value), w / 2, cy)
  ctx.font = `${Math.round(fs + 1)}px ${t.display}`
  ctx.fillStyle = rgba(t.muted)
  ctx.fillText(readout.value === 1 ? 'semitone' : 'semitones', w / 2, cy + fs * 1.5)
  ctx.textBaseline = 'middle'

  return !reduced || animating
}

const { invalidate } = useCanvasViz(wrap, canvas, draw)

function nearestNote(e: PointerEvent): 0 | 1 | -1 {
  const rect = canvas.value!.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  let best: 0 | 1 | -1 = -1
  let bd = 22 * 22
  ;([0, semis.value] as const).forEach((k, i) => {
    const p = project(view, ...at(k))
    const d = (p.x - x) ** 2 + (p.y - y) ** 2
    if (d < bd) {
      bd = d
      best = i as 0 | 1
    }
  })
  return best
}
function onMove(e: PointerEvent) {
  const rect = canvas.value!.getBoundingClientRect()
  pointerYaw = ((e.clientX - rect.left) / rect.width - 0.5) * 0.5
  canvas.value!.style.cursor = nearestNote(e) >= 0 ? 'pointer' : 'default'
  invalidate()
}
function onLeave() {
  pointerYaw = 0
  invalidate()
}
function onDown(e: PointerEvent) {
  const n = nearestNote(e)
  if (n < 0) return
  void playMidis([n === 0 ? props.lower : props.upper], undefined, 0.9)
}

/** Replays the walk: the arc counts while the two notes sound one after the other. */
function play(harmonic = false) {
  startArc()
  void playMidis([props.lower, props.upper], harmonic ? [0, 0] : [0, 0.8], 1)
}

onMounted(() => {
  // Start the counting only once the figure is actually on screen.
  prog = 0
  readout.value = 0
  const io = new IntersectionObserver(
    ([e]) => {
      if (e?.isIntersecting) {
        io.disconnect()
        startArc()
      }
    },
    { threshold: 0.4 },
  )
  io.observe(wrap.value!)
})
watch(
  () => [props.lower, props.upper],
  () => startArc(),
)
</script>

<template>
  <figure class="viz">
    <div ref="wrap" class="stage">
      <canvas
        ref="canvas"
        role="img"
        :aria-label="label"
        @pointermove="onMove"
        @pointerleave="onLeave"
        @pointerdown="onDown"
      />
    </div>
    <div class="row">
      <span class="chip" aria-hidden="true">{{ intervalShort(semis) }}</span>
      <span class="name">{{ intervalName(semis) }}</span>
      <button type="button" class="btn small" @click="play(false)">▶ Play</button>
      <button type="button" class="btn small" @click="play(true)">Together</button>
    </div>
    <figcaption v-if="caption" class="fig-caption">{{ caption }}</figcaption>
  </figure>
</template>

<style scoped>
.viz {
  margin: 1rem 0;
}
.stage {
  width: min(100%, 420px);
  aspect-ratio: 1.15;
  margin: 0 auto;
}
canvas {
  display: block;
  width: 100%;
  height: 100%;
  touch-action: pan-y;
}
.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  margin-top: 0.25rem;
}
.chip {
  font-family: var(--mono);
  font-size: 0.8rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.1rem 0.4rem;
}
.name {
  font-family: var(--display);
  font-size: 1.2rem;
  margin-right: 0.4rem;
}
.btn.small {
  padding: 0.25rem 0.7rem;
  font-size: 0.85rem;
}
figcaption {
  text-align: center;
  margin-top: 0.5rem;
}
</style>
