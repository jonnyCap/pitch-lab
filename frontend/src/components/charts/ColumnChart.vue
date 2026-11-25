<script setup lang="ts">
/**
 * Single-series column chart (e.g. training minutes per day) with an optional
 * goal reference line. Marks follow the data-viz specs: ≤ 24px columns with a
 * 4px rounded data-end and square baseline, hairline solid grid, per-column
 * hover/focus tooltip (hit area = full band), and a table view.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { columnPath, niceTicks } from './scale'

export interface ColumnDatum {
  key: string
  /** Axis/tooltip label for the column. */
  label: string
  value: number
}

const props = defineProps<{
  title: string
  data: readonly ColumnDatum[]
  unit: string
  goal?: number
  goalLabel?: string
  /** Show an x label every n columns. */
  labelEvery?: number
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

const H = computed(() => props.height ?? 180)
const M = { top: 12, right: 12, bottom: 26, left: 36 }
const plotW = computed(() => width.value - M.left - M.right)
const plotH = computed(() => H.value - M.top - M.bottom)

const ticks = computed(() =>
  niceTicks(Math.max(props.goal ?? 0, ...props.data.map((d) => d.value), 1)),
)
const yMax = computed(() => ticks.value.at(-1)!)
const y = (v: number) => M.top + plotH.value - (v / yMax.value) * plotH.value
const band = computed(() => plotW.value / Math.max(1, props.data.length))
const barW = computed(() => Math.min(24, Math.max(2, band.value - 2)))

const bars = computed(() =>
  props.data.map((d, i) => {
    const x = M.left + i * band.value + (band.value - barW.value) / 2
    const top = y(d.value)
    return {
      ...d,
      i,
      bandX: M.left + i * band.value,
      cx: x + barW.value / 2,
      path: columnPath(x, top, barW.value, M.top + plotH.value - top),
      top,
    }
  }),
)

const hover = ref<number | null>(null)
const tip = computed(() => (hover.value === null ? null : bars.value[hover.value]!))
const fmt = (v: number) => `${Math.round(v)} ${props.unit}`
</script>

<template>
  <figure class="chart">
    <figcaption>{{ title }}</figcaption>
    <div ref="el" class="plot" @pointerleave="hover = null">
      <svg :width="width" :height="H" role="img" :aria-label="title">
        <g class="grid">
          <g v-for="t in ticks" :key="t">
            <line :x1="M.left" :x2="width - M.right" :y1="y(t)" :y2="y(t)" />
            <text :x="M.left - 6" :y="y(t)" dy="0.32em" text-anchor="end">{{ t }}</text>
          </g>
        </g>
        <g v-if="goal" class="goal">
          <line :x1="M.left" :x2="width - M.right" :y1="y(goal)" :y2="y(goal)" />
          <text :x="width - M.right" :y="y(goal) - 4" text-anchor="end">
            {{ goalLabel ?? 'goal' }}
          </text>
        </g>
        <g>
          <path
            v-for="b in bars.filter((x) => x.value > 0)"
            :key="b.key"
            :d="b.path"
            class="bar"
            :class="{ dim: hover !== null && hover !== b.i }"
          />
        </g>
        <g class="xlabels">
          <text
            v-for="b in bars.filter((_, i) => i % (labelEvery ?? 1) === 0 || i === bars.length - 1)"
            :key="b.key"
            :x="b.cx"
            :y="H - 8"
            text-anchor="middle"
          >
            {{ b.label }}
          </text>
        </g>
        <!-- Hit areas: the full band height, bigger than the mark. -->
        <rect
          v-for="b in bars"
          :key="`hit-${b.key}`"
          :x="b.bandX"
          :y="M.top"
          :width="band"
          :height="plotH"
          class="hit"
          tabindex="0"
          :aria-label="`${b.label}: ${fmt(b.value)}`"
          @pointerenter="hover = b.i"
          @focus="hover = b.i"
          @blur="hover = null"
        />
      </svg>
      <div
        v-if="tip"
        class="tooltip"
        :style="{
          left: `${Math.min(Math.max(tip.cx, 60), width - 60)}px`,
          top: `${Math.max(tip.top - 8, 0)}px`,
        }"
        role="status"
      >
        <strong>{{ fmt(tip.value) }}</strong>
        <span>{{ tip.label }}</span>
      </div>
    </div>
    <details>
      <summary>Show as table</summary>
      <table>
        <thead>
          <tr>
            <th>Day</th>
            <th>{{ unit }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="d in data" :key="d.key">
            <td>{{ d.label }}</td>
            <td class="num">{{ Math.round(d.value) }}</td>
          </tr>
        </tbody>
      </table>
    </details>
  </figure>
</template>

<style scoped>
.chart {
  margin: 0;
}
figcaption {
  font-weight: 700;
  margin-bottom: 0.4rem;
}
.plot {
  position: relative;
  width: 100%;
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
.goal text {
  fill: var(--muted);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.goal line {
  stroke: var(--muted);
  stroke-width: 1;
}
.bar {
  fill: var(--series);
  transition: opacity 0.1s;
}
.bar.dim {
  opacity: 0.45;
}
.hit {
  fill: transparent;
  outline: none;
  cursor: default;
}
.hit:focus-visible {
  stroke: var(--accent);
  stroke-width: 2;
}
.tooltip {
  position: absolute;
  transform: translate(-50%, -100%);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
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
details {
  margin-top: 0.4rem;
  font-size: 0.85rem;
}
summary {
  cursor: pointer;
  color: var(--muted);
}
table {
  border-collapse: collapse;
  margin-top: 0.4rem;
}
td,
th {
  padding: 0.15rem 0.75rem 0.15rem 0;
  text-align: left;
}
.num {
  font-variant-numeric: tabular-nums;
}
</style>
