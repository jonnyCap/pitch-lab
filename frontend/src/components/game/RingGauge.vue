<!--
  Ring gauge that draws in. <RingGauge :value="0.82" label="exactly right" :reference="0.08" />
  value 0..1; `reference` draws a tick (e.g. chance level). The default slot
  replaces the centre text (large percentage + small label).
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { dur } from '@/lib/motion'

const props = withDefaults(
  defineProps<{
    value: number
    size?: number
    label?: string
    reference?: number
    tone?: 'accent' | 'ok' | 'bad' | 'ink'
  }>(),
  { size: 140, tone: 'accent' },
)

const R = 44
const clamp = (n: number) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0))
const drawn = ref(false)
const pct = computed(() => Math.round(clamp(props.value) * 100))
const offset = computed(() => (drawn.value ? 100 - clamp(props.value) * 100 : 100))
const stroke = computed(
  () =>
    ({ accent: 'var(--accent)', ok: 'var(--ok)', bad: 'var(--bad)', ink: 'var(--text)' })[
      props.tone
    ],
)
const transition = computed(() => {
  const d = dur(900)
  return d ? `stroke-dashoffset ${d}ms var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1))` : 'none'
})
const tick = computed(() => {
  if (props.reference === undefined) return null
  const a = clamp(props.reference) * Math.PI * 2 - Math.PI / 2
  const c = 50
  return {
    x1: c + Math.cos(a) * (R - 7),
    y1: c + Math.sin(a) * (R - 7),
    x2: c + Math.cos(a) * (R + 7),
    y2: c + Math.sin(a) * (R + 7),
  }
})
const aria = computed(
  () =>
    `${props.label ?? 'Value'} ${pct.value}%` +
    (props.reference !== undefined
      ? `, reference ${Math.round(clamp(props.reference) * 100)}%`
      : ''),
)

onMounted(() => {
  requestAnimationFrame(() => (drawn.value = true))
})
</script>

<template>
  <div class="ring" :style="{ width: size + 'px', height: size + 'px' }">
    <svg viewBox="0 0 100 100" role="img" :aria-label="aria">
      <circle class="track" cx="50" cy="50" :r="R" pathLength="100" />
      <circle
        class="arc"
        cx="50"
        cy="50"
        :r="R"
        pathLength="100"
        stroke-dasharray="100 100"
        :stroke-dashoffset="offset"
        :style="{ stroke, transition }"
      />
      <line v-if="tick" class="ref" v-bind="tick" />
    </svg>
    <div class="center" aria-hidden="true">
      <slot>
        <span class="num">{{ pct }}<small>%</small></span>
        <span v-if="label" class="lbl">{{ label }}</span>
      </slot>
    </div>
  </div>
</template>

<style scoped>
.ring {
  position: relative;
  display: inline-block;
}
svg {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
  overflow: visible;
}
.track {
  fill: none;
  stroke: var(--line, #e8e8e4);
  stroke-width: 3;
}
.arc {
  fill: none;
  stroke-width: 3;
  stroke-linecap: butt;
}
.ref {
  stroke: var(--text, #0b0b0c);
  stroke-width: 1;
}
.center {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  line-height: 1;
}
.num {
  font: 400 calc(v-bind(size) * 0.3px) / 1 var(--display);
  letter-spacing: -0.02em;
  color: var(--text, #0b0b0c);
}
.num small {
  font-size: 0.5em;
  margin-left: 1px;
  color: var(--muted, #5f6168);
}
.lbl {
  margin-top: 0.35rem;
  max-width: 70%;
  font-size: 0.72rem;
  color: var(--muted, #5f6168);
}
</style>
