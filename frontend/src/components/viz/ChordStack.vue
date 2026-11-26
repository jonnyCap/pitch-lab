<script setup lang="ts">
/**
 * A chord as a stack of thirds: one block per chord tone, root in cobalt, the
 * interval between neighbours labelled on the right. Choosing an inversion makes
 * the bottom block hop over the top of the stack — the same notes, a new bass.
 */
import { computed, ref, watch } from 'vue'
import { rgba } from './color'
import { useCanvasViz, type DrawArgs } from './canvas'
import {
  chordBlocks,
  chordName,
  chordTones,
  cuboidFaces,
  easeInOut,
  intervalShort,
  inversionName,
  invertedMidis,
  noteLabel,
  noteName,
  project,
  stackSlot,
  type ChordQuality,
  type Pt,
  type View,
} from './geometry'
import { playMidis } from './audio'

const props = withDefaults(
  defineProps<{
    root: number
    quality: ChordQuality
    inversion?: number
    caption?: string
  }>(),
  { inversion: 0, caption: '' },
)

const n = computed(() => chordTones(props.quality))
const blocks = computed(() => chordBlocks(props.root, props.quality))
const inv = ref(Math.min(props.inversion, n.value - 1))
watch(
  () => props.inversion,
  (v) => setInv(v),
)

const rootName = computed(() => noteName(props.root))
const midis = computed(() => invertedMidis(props.root, props.quality, inv.value))
/** Pitch (MIDI) each chord tone sounds at in the current inversion. */
const soundOf = (tone: number) => blocks.value[tone]!.midi + (tone < inv.value ? 12 : 0)
const gaps = computed(() => midis.value.slice(1).map((m, i) => m - midis.value[i]!))
const label = computed(
  () =>
    `${rootName.value} ${chordName(props.quality)} chord, ${inversionName(inv.value).toLowerCase()}: ${midis.value.map(noteLabel).join(', ')} from the bottom; the root is ${rootName.value}.`,
)

const wrap = ref<HTMLDivElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)

let shown = inv.value // animated inversion (float)
let fromInv = inv.value
let animStart = -1
let wob = 0
let pointerWob = 0
let view: View = { yaw: 0, tilt: 0, cx: 0, cy: 0, unit: 1 }
const HOP_MS = 650
const BH = 0.52 // block height
const GAP = 0.06

function setInv(v: number) {
  const next = Math.max(0, Math.min(n.value - 1, v))
  if (next === inv.value) return
  fromInv = shown
  inv.value = next
  animStart = performance.now()
  invalidate()
}

function slotsAt(f: number) {
  // Returns [slot, xOffset] per tone for a fractional inversion f.
  const base = Math.floor(f + 1e-9)
  const u = f - base
  const N = n.value
  return blocks.value.map((_, t) => {
    const leaving = t === ((base % N) + N) % N
    const s0 = stackSlot(t, base, N)
    if (u < 1e-6) return [s0, 0] as const
    if (leaving) return [(N - 1) * easeInOut(u), Math.sin(Math.PI * u) * 1.5] as const
    return [s0 - u, 0] as const
  })
}

function draw({ ctx, w, h, now, dt, t, reduced }: DrawArgs) {
  let animating = false
  if (animStart >= 0) {
    const p = reduced
      ? 1
      : Math.min(1, (now - animStart) / (HOP_MS * Math.max(1, Math.abs(inv.value - fromInv))))
    shown = fromInv + (inv.value - fromInv) * p
    if (p >= 1) {
      animStart = -1
      shown = inv.value
    } else animating = true
  }
  if (!reduced) wob += (pointerWob - wob) * Math.min(1, dt * 4)
  const N = n.value
  const total = N * (BH + GAP)
  view = {
    yaw: -0.5 + wob,
    tilt: 0.28,
    cx: w * 0.42,
    cy: h * 0.5 + (total / 2) * Math.min(w * 0.3, h * 0.28),
    unit: Math.min(w * 0.3, h * 0.28),
    f: 14,
  }
  // The stack stays put; the hopping block travels over it. Painter's order: low slots first.
  // Blocks hopping from a dropped inversion (fromInv > inv) animate by reversing the fractional model.
  const slots = slotsAt(shown)
  const order = slots.map((s, i) => ({ i, s: s[0], x: s[1] })).sort((a, b) => a.s - b.s)

  // Floor hairline.
  const fl0 = project(view, -1.6, 0, 0.7)
  const fl1 = project(view, 2.4, 0, 0.7)
  ctx.strokeStyle = rgba(t.border)
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(fl0.x, fl0.y)
  ctx.lineTo(fl1.x, fl1.y)
  ctx.stroke()

  const centres: { i: number; p: Pt }[] = []
  const fs = Math.max(11, Math.min(15, w / 26))
  const poly = (pts: Pt[]) => {
    ctx.beginPath()
    pts.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
    ctx.closePath()
  }
  for (const { i, s, x } of order) {
    const y0 = s * (BH + GAP)
    const f = cuboidFaces(view, -0.9 + x, 0.9 + x, y0, y0 + BH, -0.45, 0.45)
    const isRoot = i === 0
    ctx.lineWidth = 1
    ctx.strokeStyle = isRoot ? rgba(t.accent) : rgba(t.text, 0.8)
    ctx.fillStyle = isRoot ? rgba(t.accent, 0.35) : rgba(t.text, 0.12)
    poly(f.side)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = rgba(t.surface)
    poly(f.front)
    ctx.fill()
    ctx.fillStyle = isRoot ? rgba(t.accent, 0.12) : rgba(t.text, 0.04)
    poly(f.front)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = isRoot ? rgba(t.accent, 0.25) : rgba(t.surface)
    poly(f.top)
    ctx.fill()
    ctx.stroke()
    centres.push({ i, p: project(view, x, y0 + BH / 2, 0.45) })
  }
  ctx.textBaseline = 'middle'
  for (const { i, p } of centres) {
    const isRoot = i === 0
    ctx.textAlign = 'left'
    ctx.font = `600 ${fs + 1}px ${t.mono}`
    ctx.fillStyle = isRoot ? rgba(t.accent) : rgba(t.text)
    ctx.fillText(noteLabel(soundOf(i)), p.x - 34 * p.s - fs * 0.4, p.y)
    ctx.textAlign = 'right'
    ctx.font = `${fs + 2}px ${t.display}`
    ctx.fillStyle = isRoot ? rgba(t.accent) : rgba(t.muted)
    ctx.fillText(blocks.value[i]!.degree, p.x + 62 * p.s, p.y)
  }

  // Interval brackets between neighbouring sounding notes (settled only).
  const settle = animStart < 0 ? 1 : 0
  if (settle) {
    ctx.textAlign = 'left'
    for (let k = 0; k < gaps.value.length; k++) {
      const yb = (k + 1) * (BH + GAP) - GAP / 2
      const a = project(view, 1.55, yb - BH / 2, 0.45)
      const b = project(view, 1.55, yb + BH / 2 + GAP, 0.45)
      ctx.strokeStyle = rgba(t.muted, 0.8)
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(a.x + 6, a.y)
      ctx.lineTo(a.x + 12, a.y)
      ctx.lineTo(a.x + 12, b.y)
      ctx.lineTo(b.x + 6, b.y)
      ctx.stroke()
      ctx.font = `${fs + 3}px ${t.display}`
      ctx.fillStyle = rgba(t.text)
      ctx.fillText(intervalShort(gaps.value[k]!), a.x + 18, (a.y + b.y) / 2)
    }
  }
  return animating || (!reduced && Math.abs(wob - pointerWob) > 0.002)
}

const { invalidate } = useCanvasViz(wrap, canvas, draw)

function onMove(e: PointerEvent) {
  const r = canvas.value!.getBoundingClientRect()
  pointerWob = ((e.clientX - r.left) / r.width - 0.5) * 0.3
  invalidate()
}
function onLeave() {
  pointerWob = 0
  invalidate()
}
function play() {
  const m = midis.value
  void playMidis([...m, ...m], [...m.map(() => 0), ...m.map((_, i) => 1.3 + i * 0.38)], 1)
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
      />
    </div>
    <div class="row">
      <span class="name">{{ rootName }} {{ chordName(quality) }}</span>
      <button type="button" class="btn small" @click="play">▶ Play</button>
    </div>
    <div class="invs" role="group" aria-label="Inversion">
      <button
        v-for="k in n"
        :key="`inv-${k}`"
        type="button"
        class="inv"
        :aria-pressed="inv === k - 1"
        @click="setInv(k - 1)"
      >
        {{ inversionName(k - 1) }}
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
  width: min(100%, 460px);
  aspect-ratio: 1.2;
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
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
}
.name {
  font-family: var(--display);
  font-size: 1.2rem;
}
.btn.small {
  padding: 0.25rem 0.7rem;
  font-size: 0.85rem;
}
.invs {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.3rem;
  margin-top: 0.5rem;
}
.inv {
  font: inherit;
  font-size: 0.8rem;
  padding: 0.2rem 0.6rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
}
.inv[aria-pressed='true'] {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--on-accent);
}
figcaption {
  text-align: center;
  margin-top: 0.5rem;
}
</style>
