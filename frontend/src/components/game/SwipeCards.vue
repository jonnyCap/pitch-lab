<!--
  Card flow with horizontal slide, touch swipe, ←/→ keys and StepDots.
    <SwipeCards :count="3" v-model="step">
      <template #step-0="{ next }">…<button @click="next">Next</button></template>
      <template #step-1>…</template>
    </SwipeCards>
  Slot props: { step, next, prev, go }. Swipes ignore inputs/buttons/[data-no-swipe].
  `v-model` is optional (internal state is used when unbound). `dots` (default true) toggles the dots.
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import StepDots from './StepDots.vue'
import { dur } from '@/lib/motion'

const props = withDefaults(defineProps<{ count: number; modelValue?: number; dots?: boolean }>(), {
  modelValue: undefined,
  dots: true,
})
const emit = defineEmits<{ 'update:modelValue': [value: number] }>()

const inner = ref(0)
const step = computed(() => props.modelValue ?? inner.value)
const dir = ref<'next' | 'prev'>('next')
const dragX = ref(0)
const dragging = ref(false)
const slideMs = computed(() => dur(280))

function go(n: number) {
  const t = Math.max(0, Math.min(props.count - 1, n))
  if (t === step.value) return
  inner.value = t
  emit('update:modelValue', t)
}
const next = () => go(step.value + 1)
const prev = () => go(step.value - 1)

watch(step, (n, o) => {
  dir.value = n >= o ? 'next' : 'prev'
})

function onKey(e: KeyboardEvent) {
  if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
  const t = e.target as HTMLElement | null
  if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return
  if (document.querySelector('[aria-modal="true"]')) return
  if (e.key === 'ArrowRight') next()
  else if (e.key === 'ArrowLeft') prev()
}

let startX = 0
let startY = 0
let pid = -1
function onDown(e: PointerEvent) {
  if (e.pointerType === 'mouse') return
  if ((e.target as HTMLElement).closest('input,button,select,textarea,a,[data-no-swipe]')) return
  pid = e.pointerId
  startX = e.clientX
  startY = e.clientY
  dragging.value = true
}
function onMove(e: PointerEvent) {
  if (!dragging.value || e.pointerId !== pid) return
  const dx = e.clientX - startX
  if (Math.abs(e.clientY - startY) > Math.abs(dx) * 1.5 && Math.abs(dx) < 12) return
  const atEdge = (dx > 0 && step.value === 0) || (dx < 0 && step.value === props.count - 1)
  dragX.value = atEdge ? dx * 0.25 : dx
}
function onUp(e: PointerEvent) {
  if (!dragging.value || e.pointerId !== pid) return
  dragging.value = false
  const dx = dragX.value
  dragX.value = 0
  pid = -1
  if (dx < -50) next()
  else if (dx > 50) prev()
}

onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="cards" role="group" aria-roledescription="carousel" aria-label="Steps">
    <div
      class="stage"
      :class="[`dir-${dir}`, { dragging }]"
      :style="{ '--slide-ms': slideMs + 'ms' }"
      @pointerdown="onDown"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointercancel="onUp"
    >
      <Transition name="slide" mode="out-in">
        <div
          :key="`card-${step}`"
          class="card"
          :style="dragX ? { transform: `translateX(${dragX}px)` } : undefined"
        >
          <slot :name="`step-${step}`" :step="step" :next="next" :prev="prev" :go="go" />
        </div>
      </Transition>
    </div>
    <div v-if="dots && count > 1" class="foot">
      <StepDots :count="count" :model-value="step" @update:model-value="go" />
    </div>
    <span class="sr" role="status" aria-live="polite">Step {{ step + 1 }} of {{ count }}</span>
  </div>
</template>

<style scoped>
.cards {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.stage {
  overflow: hidden;
  touch-action: pan-y;
}
.card {
  will-change: transform;
}
.dragging .card {
  transition: none;
}
.foot {
  display: flex;
  justify-content: center;
}
.slide-enter-active,
.slide-leave-active {
  transition:
    transform var(--slide-ms) var(--ease-out, ease),
    opacity var(--slide-ms) var(--ease-out, ease);
}
.dir-next .slide-enter-from {
  transform: translateX(32px);
  opacity: 0;
}
.dir-next .slide-leave-to {
  transform: translateX(-32px);
  opacity: 0;
}
.dir-prev .slide-enter-from {
  transform: translateX(-32px);
  opacity: 0;
}
.dir-prev .slide-leave-to {
  transform: translateX(32px);
  opacity: 0;
}
.sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}
</style>
