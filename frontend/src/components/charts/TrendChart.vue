<script setup lang="ts">
/**
 * Single-series trend over time (e.g. test accuracy), y in 0–1 shown as %.
 * 2px line, ≥ 8px markers with a 2px surface ring, a labelled reference line
 * (e.g. chance level), end-point direct label, crosshair that snaps to the
 * nearest point. The values are also listed in the table the parent renders.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

export interface TrendPoint {
  key: string
  t: number
  value: number
  label: string
}

const props = defineProps<{
  title: string
  points: readonly TrendPoint[]
  reference?: number
  referenceLabel?: string
  height?: number
}>()

const el = ref<HTMLElement | null>(null)
const width = ref(600)
let ro: ResizeObserver | null = null
onMounted(() => {
  if (!el.value) return
  width.value = el.value.clientWidth || 600
  ro = new ResizeObserver(([e]) => (width.value = Math.max(240, e!.contentRect.width)))
  ro.observe(el.value)
})
onBeforeUnmount(() => ro?.disconnect())

const H = computed(() => props.height ?? 190)
const M = { top: 14, right: 44, bottom: 26, left: 40 }
const plotW = computed(() => width.value - M.left - M.right)
const plotH = computed(() => H.value - M.top - M.bottom)
const ticks = [0, 0.25, 0.5, 0.75, 1]

const tMin = computed(() => Math.min(...props.points.map((p) => p.t)))
const tMax = computed(() => Math.max(...props.points.map((p) => p.t)))
const x = (t: number) =>
  tMax.value === tMin.value
    ? M.left + plotW.value / 2
    : M.left + ((t - tMin.value) / (tMax.value - tMin.value)) * plotW.value
const y = (v: number) => M.top + plotH.value - v * plotH.value

const pts = computed(() => props.points.map((p) => ({ ...p, cx: x(p.t), cy: y(p.value) })))
const line = computed(() => pts.value.map((p, i) => `${i ? 'L' : 'M'}${p.cx},${p.cy}`).join(' '))
const last = computed(() => pts.value.at(-1) ?? null)
const pct = (v: number) => `${Math.round(v * 100)}%`

const hover = ref<number | null>(null)
function onMove(e: PointerEvent) {
  if (!el.value || pts.value.length === 0) return
  const px = e.clientX - el.value.getBoundingClientRect().left
  let best = 0
  pts.value.forEach((p, i) => {
    if (Math.abs(p.cx - px) < Math.abs(pts.value[best]!.cx - px)) best = i
  })
  hover.value = best
}
const tip = computed(() => (hover.value === null ? null : pts.value[hover.value]!))
</script>

<template>
  <figure class="chart">
    <figcaption>{{ title }}</figcaption>
    <div
      ref="el"
      class="plot"
      tabindex="0"
      :aria-label="`${title}. Use left and right arrow keys to read values.`"
      @pointermove="onMove"
      @pointerleave="hover = null"
      @blur="hover = null"
      @keydown.left.prevent="hover = Math.max(0, (hover ?? pts.length) - 1)"
      @keydown.right.prevent="hover = Math.min(pts.length - 1, (hover ?? -1) + 1)"
    >
      <svg :width="width" :height="H" role="img" :aria-label="title">
        <g class="grid">
          <g v-for="t in ticks" :key="t">
            <line :x1="M.left" :x2="width - M.right" :y1="y(t)" :y2="y(t)" />
            <text :x="M.left - 6" :y="y(t)" dy="0.32em" text-anchor="end">{{ pct(t) }}</text>
          </g>
        </g>
        <g v-if="reference !== undefined" class="ref">
          <line :x1="M.left" :x2="width - M.right" :y1="y(reference)" :y2="y(reference)" />
          <text :x="width - M.right" :y="y(reference) + 12" text-anchor="end">
            {{ referenceLabel }}
          </text>
        </g>
        <line
          v-if="tip"
          class="crosshair"
          :x1="tip.cx"
          :x2="tip.cx"
          :y1="M.top"
          :y2="M.top + plotH"
        />
        <path v-if="pts.length > 1" :d="line" class="line" pathLength="1" />
        <circle v-for="p in pts" :key="p.key" :cx="p.cx" :cy="p.cy" r="4.5" class="dot" />
        <text v-if="last" class="end" :x="last.cx + 8" :y="last.cy" dy="0.32em">
          {{ pct(last.value) }}
        </text>
        <g class="xlabels">
          <text
            v-for="(p, i) in pts.filter((_, i) => i === 0 || i === pts.length - 1)"
            :key="p.key"
            :x="p.cx"
            :y="H - 8"
            :text-anchor="pts.length === 1 ? 'middle' : i === 0 ? 'start' : 'end'"
          >
            {{ new Date(p.t).toLocaleDateString() }}
          </text>
        </g>
      </svg>
      <div
        v-if="tip"
        class="tooltip"
        :style="{
          left: `${Math.min(Math.max(tip.cx, 70), width - 70)}px`,
          top: `${Math.max(tip.cy - 10, 0)}px`,
        }"
        role="status"
      >
        <strong>{{ pct(tip.value) }}</strong>
        <span>{{ tip.label }}</span>
      </div>
    </div>
  </figure>
</template>

<style scoped>
.chart {
  margin: 0;
}
figcaption {
  font-family: var(--display);
  font-size: 1.1rem;
  color: var(--muted);
  margin-bottom: 0.4rem;
}
.plot {
  position: relative;
  width: 100%;
  outline: none;
}
.plot:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 4px;
  border-radius: 6px;
}
svg {
  display: block;
  overflow: visible;
}
.grid line {
  stroke: var(--grid);
  stroke-width: 1;
}
.grid text,
.xlabels text,
.ref text,
.end {
  fill: var(--muted);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.end {
  fill: var(--text);
  font-family: var(--display);
  font-size: 17px;
}
.ref line,
.crosshair {
  stroke: var(--muted);
  stroke-width: 1;
}
.line {
  fill: none;
  stroke: var(--series);
  stroke-width: 2;
  stroke-linejoin: round;
  stroke-linecap: round;
  stroke-dasharray: 1;
  animation: draw 0.9s cubic-bezier(0.3, 0.6, 0.2, 1) backwards;
}
@keyframes draw {
  from {
    stroke-dashoffset: 1;
  }
}
.dot {
  fill: var(--series);
  stroke: var(--surface);
  stroke-width: 2;
  animation: appear 0.4s 0.5s backwards;
}
.end {
  animation: appear 0.4s 0.7s backwards;
}
@keyframes appear {
  from {
    opacity: 0;
  }
}
.tooltip {
  position: absolute;
  transform: translate(-50%, -100%);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.3rem 0.55rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  font-size: 0.8rem;
  pointer-events: none;
  white-space: nowrap;
  box-shadow: var(--shadow);
}
.tooltip span {
  color: var(--muted);
}
</style>
