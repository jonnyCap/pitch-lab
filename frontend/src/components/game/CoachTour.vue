<!--
  Guided tour with spotlight cut-out.
    <CoachTour ref="tour" id="trainer" :steps="steps" @done="…" />   <HelpButton @click="tour?.start()" />
  Auto-starts once (not in E2E, not if already seen) shortly after mount, but only if at least one
  targeted step resolves. Steps whose `target` is missing are skipped. Closing (Done, Skip, Esc)
  marks the tour seen and emits `done`. start() replays regardless of "seen".
  Keys: ←/→ navigate, Enter = next/done, Esc = close. Focus is trapped and restored.
  Below 560px the card docks as a bottom sheet. Never start a tour while a level is running.
-->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { dur } from '@/lib/motion'
import { hasSeenTour, markTourSeen, toursEnabled, type TourStep } from '@/lib/tour'

const props = withDefaults(defineProps<{ id: string; steps: TourStep[]; autoStart?: boolean }>(), {
  autoStart: true,
})
const emit = defineEmits<{ done: [] }>()

const PAD = 6
const GAP = 14
const SHEET_W = 560

const open = ref(false)
const active = ref<TourStep[]>([])
const i = ref(0)
const sheet = ref(false)
const placed = ref(false)
const spot = ref({ x: 0, y: 0, w: 0, h: 0 })
const pop = ref({ x: 0, y: 0 })
const card = ref<HTMLElement | null>(null)
const nextBtn = ref<HTMLButtonElement | null>(null)

const uid = `tour-${Math.random().toString(36).slice(2, 8)}`
const step = computed(() => active.value[i.value])
const last = computed(() => i.value === active.value.length - 1)
const ms = computed(() => dur(320))

let returnFocus: HTMLElement | null = null
let startTimer: ReturnType<typeof setTimeout> | undefined
let ro: ResizeObserver | null = null
let raf = 0

function targetEl(s: TourStep | undefined): Element | null {
  if (!s?.target) return null
  try {
    return document.querySelector(s.target)
  } catch {
    return null
  }
}

function layout() {
  if (!open.value || !step.value) return
  sheet.value = window.innerWidth < SHEET_W
  const vw = window.innerWidth
  const vh = window.innerHeight
  const el = targetEl(step.value)
  const cw = card.value?.offsetWidth ?? 320
  const ch = card.value?.offsetHeight ?? 160
  if (!el) {
    spot.value = { x: vw / 2, y: vh / 2, w: 0, h: 0 }
    pop.value = { x: (vw - cw) / 2, y: (vh - ch) / 2 }
    return
  }
  const r = el.getBoundingClientRect()
  spot.value = { x: r.left - PAD, y: r.top - PAD, w: r.width + PAD * 2, h: r.height + PAD * 2 }
  if (sheet.value) return
  const s = spot.value
  const room = {
    bottom: vh - (s.y + s.h),
    top: s.y,
    right: vw - (s.x + s.w),
    left: s.x,
  }
  let p = step.value.placement ?? 'auto'
  if (p === 'auto')
    p =
      room.bottom >= ch + GAP
        ? 'bottom'
        : room.top >= ch + GAP
          ? 'top'
          : room.right >= cw + GAP
            ? 'right'
            : 'left'
  let x = s.x + s.w / 2 - cw / 2
  let y = s.y + s.h + GAP
  if (p === 'top') y = s.y - ch - GAP
  else if (p === 'right') {
    x = s.x + s.w + GAP
    y = s.y + s.h / 2 - ch / 2
  } else if (p === 'left') {
    x = s.x - cw - GAP
    y = s.y + s.h / 2 - ch / 2
  }
  pop.value = {
    x: Math.max(12, Math.min(vw - cw - 12, x)),
    y: Math.max(12, Math.min(vh - ch - 12, y)),
  }
}

function schedule() {
  cancelAnimationFrame(raf)
  raf = requestAnimationFrame(layout)
}

function observe() {
  ro?.disconnect()
  const el = targetEl(step.value)
  if (el && typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(schedule)
    ro.observe(el)
  }
}

async function show(n: number) {
  i.value = n
  await nextTick()
  const el = targetEl(step.value)
  if (el) {
    const r = el.getBoundingClientRect()
    const margin = sheet.value ? window.innerHeight * 0.45 : 80
    if (r.top < 60 || r.bottom > window.innerHeight - margin) {
      el.scrollIntoView?.({ block: sheet.value ? 'start' : 'center', behavior: 'auto' })
    }
  }
  layout()
  observe()
  if (!placed.value) {
    await nextTick() // render the first position without a transition, then enable them
    placed.value = true
  }
  nextBtn.value?.focus({ preventScroll: true })
}

function start() {
  if (open.value) return
  const withTarget = props.steps.filter((s) => s.target)
  const list = props.steps.filter((s) => !s.target || targetEl(s))
  if (!list.length || (withTarget.length && !list.some((s) => s.target))) return
  active.value = list
  returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
  placed.value = false
  sheet.value = window.innerWidth < SHEET_W
  open.value = true
  void show(0)
}

function close() {
  if (!open.value) return
  open.value = false
  cancelAnimationFrame(raf)
  ro?.disconnect()
  markTourSeen(props.id)
  returnFocus?.focus?.({ preventScroll: true })
  returnFocus = null
  emit('done')
}

function go(d: 1 | -1) {
  const n = i.value + d
  if (n < 0) return
  if (n >= active.value.length) return close()
  void show(n)
}

function onKey(e: KeyboardEvent) {
  if (!open.value) return
  const t = e.target as HTMLElement | null
  const onBtn = !!t && /^(BUTTON|A)$/.test(t.tagName)
  if (e.key === 'Tab') {
    const f = Array.from(card.value?.querySelectorAll<HTMLElement>('button, [href]') ?? [])
    if (!f.length) return
    const a = document.activeElement
    const first = f[0]!
    const lastEl = f[f.length - 1]!
    if (!card.value?.contains(a)) {
      e.preventDefault()
      first.focus()
    } else if (e.shiftKey && a === first) {
      e.preventDefault()
      lastEl.focus()
    } else if (!e.shiftKey && a === lastEl) {
      e.preventDefault()
      first.focus()
    }
    return
  }
  let handled = true
  if (e.key === 'Escape') close()
  else if (e.key === 'ArrowRight') go(1)
  else if (e.key === 'ArrowLeft') go(-1)
  else if (e.key === 'Enter' && !onBtn) go(1)
  else handled = false
  if (handled) {
    e.preventDefault()
    e.stopPropagation()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKey, true)
  window.addEventListener('resize', schedule)
  window.addEventListener('scroll', schedule, { capture: true, passive: true })
  if (props.autoStart && toursEnabled() && !hasSeenTour(props.id)) {
    startTimer = setTimeout(start, 600)
  }
})
onBeforeUnmount(() => {
  clearTimeout(startTimer)
  cancelAnimationFrame(raf)
  ro?.disconnect()
  window.removeEventListener('keydown', onKey, true)
  window.removeEventListener('resize', schedule)
  window.removeEventListener('scroll', schedule, true)
})

defineExpose({ start })
</script>

<template>
  <Teleport to="body">
    <div v-if="open && step" class="tour" :class="{ sheet, placed }" data-coach-tour>
      <div class="blocker" aria-hidden="true" />
      <div
        class="spot"
        aria-hidden="true"
        :class="{ empty: !spot.w }"
        :style="{
          transform: `translate(${spot.x}px, ${spot.y}px)`,
          width: spot.w + 'px',
          height: spot.h + 'px',
          '--ms': ms + 'ms',
        }"
      />
      <div
        ref="card"
        class="card"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="`${uid}-t`"
        :aria-describedby="`${uid}-b`"
        :style="{
          transform: sheet ? undefined : `translate(${pop.x}px, ${pop.y}px)`,
          '--ms': ms + 'ms',
        }"
      >
        <div class="inner" aria-live="polite">
          <p class="count">{{ i + 1 }} / {{ active.length }}</p>
          <h2 :id="`${uid}-t`" class="title">{{ step.title }}</h2>
          <p :id="`${uid}-b`" class="body">{{ step.body }}</p>
        </div>
        <div class="actions">
          <button v-if="!last" type="button" class="skip" @click="close">Skip tour</button>
          <span class="spacer" />
          <button v-if="i > 0" type="button" class="btn" @click="go(-1)">Back</button>
          <button ref="nextBtn" type="button" class="btn btn-primary" @click="go(1)">
            {{ last ? 'Done' : 'Next' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.tour {
  position: fixed;
  inset: 0;
  z-index: 900;
}
.blocker {
  position: absolute;
  inset: 0;
}
.spot {
  position: absolute;
  left: 0;
  top: 0;
  border-radius: 10px;
  box-shadow:
    0 0 0 9999px rgb(11 11 12 / 0.58),
    0 0 0 1.5px var(--accent, #1e40ff);
  pointer-events: none;
  opacity: 0;
}
.placed .spot {
  opacity: 1;
  transition:
    transform var(--ms) var(--ease-out, ease),
    width var(--ms) var(--ease-out, ease),
    height var(--ms) var(--ease-out, ease),
    opacity 0.2s var(--ease-out, ease);
}
.spot.empty {
  box-shadow: 0 0 0 9999px rgb(11 11 12 / 0.58);
}
.card {
  position: absolute;
  left: 0;
  top: 0;
  width: min(340px, calc(100vw - 24px));
  box-sizing: border-box;
  padding: 1.1rem 1.25rem 1rem;
  border: 1px solid var(--border, #dcdcd8);
  border-radius: var(--radius, 4px);
  background: var(--surface, #fff);
  color: var(--text, #0b0b0c);
  box-shadow: var(--shadow, 0 12px 32px -16px rgb(0 0 0 / 0.3));
  opacity: 0;
}
.placed .card {
  opacity: 1;
  transition:
    transform var(--ms) var(--ease-out, ease),
    opacity 0.2s var(--ease-out, ease);
}
.count {
  margin: 0 0 0.35rem;
  font: 0.72rem/1 var(--mono, monospace);
  color: var(--muted, #5f6168);
}
.title {
  margin: 0 0 0.4rem;
  font: 600 1.2rem/1.3 var(--display);
  letter-spacing: -0.01em;
}
.body {
  margin: 0;
  font-size: 0.95rem;
  line-height: 1.5;
  color: var(--muted, #5f6168);
}
.actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 1rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--line, #e8e8e4);
}
.spacer {
  flex: 1;
}
.skip {
  padding: 0.25rem 0;
  border: 0;
  background: none;
  color: var(--muted, #5f6168);
  font: inherit;
  font-size: 0.85rem;
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}
.skip:hover {
  color: var(--accent-ink, #1e40ff);
}
.skip:focus-visible,
.card :deep(.btn:focus-visible) {
  outline: 2px solid var(--accent, #1e40ff);
  outline-offset: 2px;
}
.sheet .card {
  top: auto;
  left: 0;
  right: 0;
  bottom: 0;
  width: auto;
  border-width: 1px 0 0;
  border-radius: 12px 12px 0 0;
  padding-bottom: calc(1rem + env(safe-area-inset-bottom, 0px));
  transform: translateY(24px);
  transition:
    transform 0.32s var(--ease-out, ease),
    opacity 0.2s var(--ease-out, ease);
}
.sheet.placed .card {
  transform: none;
}
</style>
