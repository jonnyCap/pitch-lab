<script setup lang="ts">
/**
 * A scale as a rising 3D staircase: each tread is a note, each riser is a whole
 * (2 semitones, tall) or half (1 semitone, short) step. Tap a tread to hear it,
 * or play the whole scale and watch the steps light up in turn.
 */
import { computed, ref } from 'vue'
import { rgba } from './color'
import { useCanvasViz, type DrawArgs } from './canvas'
import {
  cuboidFaces,
  noteLabel,
  noteName,
  project,
  scaleMidis,
  stepLetter,
  type Pt,
  type View,
} from './geometry'
import { playMidis } from './audio'

const props = withDefaults(
  defineProps<{ tonic: number; pattern: readonly number[]; name?: string; caption?: string }>(),
  { name: '', caption: '' },
)

const midis = computed(() => scaleMidis(props.tonic, props.pattern))
const label = computed(
  () =>
    `${props.name || 'Scale'} from ${noteLabel(props.tonic)}: ${props.pattern.map(stepLetter).join(' ')}. Steps: ${midis.value.map(noteName).join(', ')}.`,
)

const wrap = ref<HTMLDivElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const SPAN = 0.32 // seconds between notes when played

let active = -1
let activeSince = 0
let playStart = 0
let sweeping = false
let hover = -1
let view: View = { yaw: 0, tilt: 0, cx: 0, cy: 0, unit: 1 }
let wob = 0
let pointerWob = 0

const HS = 0.1 // height per semitone
const heightOf = (i: number) => 0.16 + (midis.value[i]! - props.tonic) * HS

interface Box {
  i: number
  faces: { top: Pt[]; front: Pt[]; side: Pt[] }
  z: number
}
let boxes: Box[] = []

function layout(w: number, h: number): void {
  const n = midis.value.length
  const total = (midis.value[n - 1]! - props.tonic) * HS + 0.16
  view = {
    yaw: -0.55 + wob,
    tilt: 0.42,
    cx: w / 2,
    cy: h * 0.5 + total * Math.min(w * 0.11, h * 0.3) * 0.55,
    unit: Math.min((w * 0.82) / (n * 0.92 * Math.cos(0.55) + 1), h * 0.3),
    f: 14,
  }
  boxes = midis.value.map((_, i) => {
    const x0 = (i - n / 2) * 0.92
    const faces = cuboidFaces(view, x0, x0 + 0.84, 0, heightOf(i), -0.4, 0.4)
    const c = project(view, x0 + 0.42, heightOf(i) / 2, 0)
    return { i, faces, z: c.z }
  })
}

const poly = (ctx: CanvasRenderingContext2D, pts: Pt[]) => {
  ctx.beginPath()
  pts.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
  ctx.closePath()
}

function draw({ ctx, w, h, now, dt, t, reduced }: DrawArgs) {
  if (!reduced) wob += (pointerWob - wob) * Math.min(1, dt * 4)
  layout(w, h)
  // Sweep during playback.
  let animating = false
  if (sweeping) {
    const idx = Math.floor((now - playStart) / (SPAN * 1000))
    if (idx >= midis.value.length + 1) {
      sweeping = false
      active = -1
    } else if (idx >= 0 && idx < midis.value.length) {
      if (idx !== active) activeSince = now
      active = idx
    }
    animating = sweeping
  }
  const pulse = active >= 0 ? Math.max(0, 1 - (now - activeSince) / 600) : 0
  if (pulse > 0 && !reduced) animating = true

  // Floor hairline.
  const a = project(view, -midis.value.length * 0.46 - 0.2, 0, 0.6)
  const b = project(view, midis.value.length * 0.46 + 0.7, 0, 0.6)
  ctx.strokeStyle = rgba(t.border)
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(a.x, a.y)
  ctx.lineTo(b.x, b.y)
  ctx.stroke()

  const order = [...boxes].sort((p, q) => p.z - q.z)
  for (const bx of order) {
    const on = bx.i === active || bx.i === hover
    ctx.lineWidth = 1
    ctx.strokeStyle = rgba(t.text, 0.8)
    ctx.fillStyle = rgba(t.text, 0.1)
    poly(ctx, bx.faces.side)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = rgba(t.surface)
    poly(ctx, bx.faces.front)
    ctx.fill()
    ctx.fillStyle = rgba(t.text, 0.04)
    poly(ctx, bx.faces.front)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = on
      ? rgba(t.accent, 0.35 + 0.65 * (bx.i === active ? pulse : 0.6))
      : rgba(t.surface)
    poly(ctx, bx.faces.top)
    ctx.fill()
    ctx.lineWidth = on ? 1.6 : 1
    ctx.strokeStyle = on ? rgba(t.accent) : rgba(t.text, 0.8)
    ctx.stroke()
  }

  // Labels: note names above treads, step brackets between them.
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const fs = Math.max(11, Math.min(15, w / 26))
  const n = midis.value.length
  const centre = (i: number, up = 0) => {
    const x0 = (i - n / 2) * 0.92
    return project(view, x0 + 0.42, heightOf(i) + up, 0)
  }
  for (let i = 0; i < n; i++) {
    const p = centre(i, 0.22)
    ctx.font = `600 ${fs}px ${t.mono}`
    ctx.fillStyle = i === active || i === hover ? rgba(t.accent) : rgba(t.text)
    ctx.fillText(noteName(midis.value[i]!), p.x, p.y)
  }
  for (let i = 0; i < props.pattern.length; i++) {
    const s = props.pattern[i]!
    const p0 = centre(i, 0.55)
    const p1 = centre(i + 1, 0.55)
    ctx.strokeStyle = rgba(t.muted, 0.7)
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(p0.x, p0.y)
    ctx.lineTo((p0.x + p1.x) / 2, Math.min(p0.y, p1.y) - 5)
    ctx.lineTo(p1.x, p1.y)
    ctx.stroke()
    const mx = (p0.x + p1.x) / 2
    const my = Math.min(p0.y, p1.y) - 5 - fs * 0.7
    const text = stepLetter(s)
    ctx.font = `${fs + 2}px ${t.display}`
    const tw = ctx.measureText(text).width + 10
    ctx.fillStyle = rgba(t.surface)
    ctx.strokeStyle = s === 1 ? rgba(t.accent) : rgba(t.border)
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(mx - tw / 2, my - fs * 0.75, tw, fs * 1.5, 3)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = s === 1 ? rgba(t.accent) : rgba(t.text)
    ctx.fillText(text, mx, my)
  }
  return animating || (!reduced && Math.abs(wob - pointerWob) > 0.002)
}

const { invalidate } = useCanvasViz(wrap, canvas, draw)

function inPoly(p: Pt[], x: number, y: number) {
  let inside = false
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const a = p[i]!
    const b = p[j]!
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}
function pick(e: PointerEvent): number {
  const r = canvas.value!.getBoundingClientRect()
  const x = e.clientX - r.left
  const y = e.clientY - r.top
  for (const bx of [...boxes].sort((p, q) => q.z - p.z)) {
    if (inPoly(bx.faces.top, x, y) || inPoly(bx.faces.front, x, y) || inPoly(bx.faces.side, x, y))
      return bx.i
  }
  return -1
}

function flashStep(i: number) {
  active = i
  activeSince = performance.now()
  invalidate()
}
function onMove(e: PointerEvent) {
  const r = canvas.value!.getBoundingClientRect()
  pointerWob = ((e.clientX - r.left) / r.width - 0.5) * 0.25
  hover = e.pointerType === 'mouse' ? pick(e) : -1
  canvas.value!.style.cursor = hover >= 0 ? 'pointer' : 'default'
  invalidate()
}
function onLeave() {
  hover = -1
  pointerWob = 0
  invalidate()
}
function onDown(e: PointerEvent) {
  const i = pick(e)
  if (i >= 0) playStep(i)
}
function playStep(i: number) {
  flashStep(i)
  void playMidis([midis.value[i]!], undefined, 0.8)
}
function playScale() {
  sweeping = true
  playStart = performance.now() + 120
  invalidate()
  void playMidis(
    midis.value,
    midis.value.map((_, i) => i * SPAN),
    0.34,
  )
}
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
      <span v-if="name" class="name">{{ name }}</span>
      <button type="button" class="btn small" @click="playScale">▶ Play scale</button>
    </div>
    <div class="notes" role="group" :aria-label="`${name || 'Scale'} notes`">
      <button
        v-for="(m, i) in midis"
        :key="`n-${i}`"
        type="button"
        class="note"
        :aria-label="`Play ${noteLabel(m)}`"
        @click="playStep(i)"
      >
        {{ noteName(m) }}
      </button>
    </div>
    <figcaption v-if="caption" class="fig-caption">{{ caption }}</figcaption>
  </figure>
</template>

<style scoped>
.viz {
  margin: 1rem 0;
}
.stage {
  width: 100%;
  aspect-ratio: 2.2;
  min-height: 190px;
}
canvas {
  display: block;
  width: 100%;
  height: 100%;
  touch-action: pan-y;
}
.row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  margin-top: 0.25rem;
}
.name {
  font-family: var(--display);
  font-size: 1.2rem;
}
.btn.small {
  padding: 0.25rem 0.7rem;
  font-size: 0.85rem;
}
.notes {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.3rem;
  margin-top: 0.5rem;
}
.note {
  font: inherit;
  font-family: var(--mono);
  font-size: 0.8rem;
  min-width: 2rem;
  padding: 0.15rem 0.4rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
}
.note:hover {
  border-color: var(--accent);
  color: var(--accent-ink);
}
figcaption {
  text-align: center;
  margin-top: 0.5rem;
}
</style>
