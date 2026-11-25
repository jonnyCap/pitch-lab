<script setup lang="ts">
/**
 * Rhythm notation (VexFlow): one or more bars on a stave without clef, notes on
 * the middle line, auto-beamed. Without a fixed `width` it fills its container
 * and wraps bars onto several lines (≥ 140 px per bar). Also used for single
 * note values.
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { RhythmEvent } from '@/learn/rhythm'

const props = defineProps<{
  bars: readonly (readonly RhythmEvent[])[]
  timeSignature?: string
  width?: number
  label?: string
}>()

const el = ref<HTMLDivElement | null>(null)
const host = ref<HTMLDivElement | null>(null)
const measured = ref(320)
let disposed = false
let ro: ResizeObserver | null = null
const MIN_BAR = 140
const ROW_H = 100

async function draw() {
  const host = el.value
  if (!host) return
  const VF = await import('vexflow/bravura')
  await VF.default.loadFonts('Bravura', 'Academico')
  if (disposed || !el.value) return
  host.innerHTML = ''
  const { Renderer, Stave, StaveNote, Formatter, Dot } = VF
  const width = props.width ?? measured.value
  const perRow = Math.max(1, Math.min(props.bars.length, Math.floor((width - 16) / MIN_BAR)))
  const rows = Math.ceil(props.bars.length / perRow)
  const renderer = new Renderer(host, Renderer.Backends.SVG)
  renderer.resize(width, rows * ROW_H + 10)
  const ctx = renderer.getContext()
  ctx.setFillStyle('currentColor')
  ctx.setStrokeStyle('currentColor')
  const barW = (width - 16) / perRow
  props.bars.forEach((bar, i) => {
    const stave = new Stave(8 + (i % perRow) * barW, 10 + Math.floor(i / perRow) * ROW_H, barW)
    if (i === 0 && props.timeSignature) stave.addTimeSignature(props.timeSignature)
    stave.setContext(ctx).draw()
    const notes = bar.map((e) => {
      const n = new StaveNote({ keys: ['b/4'], duration: e.code, autoStem: true })
      if (e.code.replace('r', '').endsWith('d')) Dot.buildAndAttach([n], { all: true })
      n.setStyle({ fillStyle: 'currentColor', strokeStyle: 'currentColor' })
      return n
    })
    Formatter.FormatAndDraw(ctx, stave, notes, { autoBeam: true })
  })
}

onMounted(() => {
  if (props.width === undefined && host.value) {
    measured.value = Math.max(160, host.value.clientWidth)
    ro = new ResizeObserver(([e]) => {
      const w = Math.max(160, Math.round(e!.contentRect.width))
      if (Math.abs(w - measured.value) > 8) measured.value = w
    })
    ro.observe(host.value)
  }
  void draw()
})
watch(() => JSON.stringify(props.bars) + props.timeSignature + props.width + measured.value, draw)
onBeforeUnmount(() => {
  disposed = true
  ro?.disconnect()
})
</script>

<template>
  <div ref="host" class="rhythm" role="img" :aria-label="label ?? 'rhythm notation'">
    <div ref="el" />
  </div>
</template>

<style scoped>
.rhythm {
  color: var(--text);
  display: flex;
  justify-content: center;
  width: 100%;
}
.rhythm :deep(svg) {
  display: block;
  overflow: visible;
}
</style>
