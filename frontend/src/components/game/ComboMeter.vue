<!--
  Streak indicator. <ComboMeter :combo="combo" :best="best" /> — FEEDBACK LEVELS ONLY.
  Always occupies the same box (visibility toggles) so it never shifts layout.
  Hidden below 2; bumps on increments, bigger at 5/10/20.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { dur } from '@/lib/motion'

const props = defineProps<{ combo: number; best?: number }>()

const el = ref<HTMLElement | null>(null)
const visible = computed(() => props.combo >= 2)
const milestone = computed(() => [5, 10, 20].includes(props.combo))
const announce = computed(() => (milestone.value ? `Streak of ${props.combo}` : ''))

watch(
  () => props.combo,
  (n, o) => {
    const d = dur(milestone.value ? 520 : 320)
    if (!el.value || n <= o || n < 2 || d === 0 || typeof el.value.animate !== 'function') return
    const peak = n >= 20 ? 1.42 : n >= 10 ? 1.3 : n >= 5 ? 1.22 : 1.1
    el.value.animate(
      [
        { transform: 'scale(1)' },
        { transform: `scale(${peak})`, offset: 0.35 },
        { transform: 'scale(1)' },
      ],
      {
        duration: d,
        easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
    )
  },
)
</script>

<template>
  <div class="combo" :class="{ on: visible }" :aria-hidden="!visible">
    <span ref="el" class="n" :class="{ big: combo >= 10 }">
      <span class="x">×</span>{{ combo }}
    </span>
    <span class="lbl"
      >streak<template v-if="best && best > combo"> · best {{ best }}</template></span
    >
    <span class="sr" role="status" aria-live="polite">{{ announce }}</span>
  </div>
</template>

<style scoped>
.combo {
  display: inline-flex;
  align-items: baseline;
  gap: 0.4rem;
  min-width: 7.5rem;
  opacity: 0;
  transform: translateY(2px);
  transition:
    opacity 0.2s var(--ease-out, ease),
    transform 0.2s var(--ease-out, ease);
  pointer-events: none;
}
.combo.on {
  opacity: 1;
  transform: none;
}
.n {
  display: inline-block;
  font: 400 1.6rem/1 var(--serif, Georgia, serif);
  color: var(--text, #0b0b0c);
  letter-spacing: -0.01em;
  transform-origin: left center;
}
.n.big {
  color: var(--accent-ink, #1e40ff);
}
.x {
  font-size: 0.7em;
  margin-right: 1px;
  color: var(--muted, #5f6168);
}
.lbl {
  font-size: 0.72rem;
  font-variant-caps: all-small-caps;
  letter-spacing: 0.06em;
  color: var(--muted, #5f6168);
}
.sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}
</style>
