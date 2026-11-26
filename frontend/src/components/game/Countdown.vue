<!--
  Silent "3, 2, 1, Go" countdown. <Countdown @done="run" />
  Fills its (positioned) parent and ignores pointer events. Emits `done` after "Go".
  Timings go through dur(): near-instant in E2E, immediate under reduced motion.
  The numerals are aria-hidden; a polite status announces "Get ready" once.
-->
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { dur } from '@/lib/motion'

defineOptions({ name: 'GameCountdown' })
const props = withDefaults(defineProps<{ from?: number; stepMs?: number }>(), {
  from: 3,
  stepMs: 650,
})
const emit = defineEmits<{ done: [] }>()

const label = ref<string>('')
const tick = ref(0)
let timer: ReturnType<typeof setTimeout> | undefined
let dead = false

function run(n: number) {
  if (dead) return
  if (n > 0) {
    label.value = String(n)
    tick.value++
    timer = setTimeout(() => run(n - 1), dur(props.stepMs))
  } else {
    label.value = 'Go'
    tick.value++
    timer = setTimeout(
      () => {
        if (!dead) emit('done')
      },
      dur(props.stepMs * 0.7),
    )
  }
}

onMounted(() => run(props.from))
onBeforeUnmount(() => {
  dead = true
  clearTimeout(timer)
})
</script>

<template>
  <div class="countdown">
    <span class="sr" role="status" aria-live="polite">Get ready</span>
    <span
      :key="`n-${tick}`"
      class="num"
      :class="{ go: label === 'Go' }"
      aria-hidden="true"
      :style="{ animationDuration: dur(stepMs) + 'ms' }"
      >{{ label }}</span
    >
  </div>
</template>

<style scoped>
.countdown {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.num {
  font: 300 clamp(4rem, 16vw, 7rem) / 1 var(--display);
  letter-spacing: -0.02em;
  color: var(--text, #0b0b0c);
  animation: cd-step 0.65s var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)) both;
}
.num.go {
  color: var(--accent-ink, #1e40ff);
}
@keyframes cd-step {
  0% {
    opacity: 0;
    transform: scale(1.35);
  }
  28% {
    opacity: 1;
    transform: scale(1);
  }
  70% {
    opacity: 1;
    transform: scale(0.96);
  }
  100% {
    opacity: 0;
    transform: scale(0.88);
  }
}
.sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}
</style>
