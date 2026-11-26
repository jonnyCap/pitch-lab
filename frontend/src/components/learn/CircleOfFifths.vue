<script setup lang="ts">
/**
 * Interactive circle of fifths: major keys outside, relative minors inside.
 * Selecting a key shows its key signature, plays its major scale and turns the
 * ring so that key sits at the top, with its two neighbours (the keys one sharp
 * or flat away) highlighted.
 */
import { computed, ref, watch } from 'vue'
import { CIRCLE, keyInfo } from '@/learn/harmony'
import { parseNote, prettyPitch } from '@/learn/notes'
import { makeScaleNotesFrom } from '@/learn/harmony'
import { playStyled } from '@/learn/sound'
import StaffNotation from './StaffNotation.vue'

const selected = ref<string>('C')
const info = computed(() => keyInfo(selected.value))
const accidentals = computed(() => {
  const a = info.value.alteration
  if (a === 0) return 'no sharps or flats'
  return `${Math.abs(a)} ${a > 0 ? 'sharp' : 'flat'}${Math.abs(a) === 1 ? '' : 's'}`
})

const index = computed(() =>
  Math.max(
    0,
    CIRCLE.findIndex((c) => c.major === selected.value || c.alt === selected.value),
  ),
)
/** Accumulated rotation in degrees (never wraps back, so the ring always turns the short way). */
const rot = ref(0)
watch(
  index,
  (i) => {
    const target = -i * 30
    let d = (target - rot.value) % 360
    if (d > 180) d -= 360
    if (d < -180) d += 360
    rot.value += d
  },
  { immediate: true },
)
const near = (i: number) => {
  const d = (i - index.value + 12) % 12
  return d === 1 || d === 11
}

function pos(i: number, r: number) {
  const angle = (i / 12) * 2 * Math.PI - Math.PI / 2
  return { left: `${50 + r * Math.cos(angle)}%`, top: `${50 + r * Math.sin(angle)}%` }
}

async function choose(major: string) {
  selected.value = major
  const notes = makeScaleNotesFrom(`${major}4`, 'major')
  await playStyled(
    notes.map((n) => parseNote(n).midi),
    'scale',
  )
}
</script>

<template>
  <div class="circle-wrap">
    <div
      class="circle"
      role="group"
      aria-label="Circle of fifths"
      :style="{ '--rot': `${rot}deg` }"
    >
      <span class="marker" aria-hidden="true" />
      <div class="ring">
        <template v-for="(c, i) in CIRCLE" :key="c.major">
          <button
            type="button"
            class="major"
            :class="{ on: selected === c.major || selected === c.alt, near: near(i) }"
            :style="pos(i, 41)"
            :aria-label="`${prettyPitch(c.major)} major`"
            @click="choose(c.major)"
          >
            {{ prettyPitch(c.major) }}<small v-if="c.alt">/{{ prettyPitch(c.alt) }}</small>
          </button>
          <span class="minor" :class="{ near: near(i) || i === index }" :style="pos(i, 24)">{{
            prettyPitch(keyInfo(c.major).minor).toLowerCase()
          }}</span>
        </template>
      </div>
      <div class="center">
        <strong>{{ prettyPitch(info.major) }} major</strong>
        <span class="muted">{{ prettyPitch(info.minor) }} minor</span>
        <span class="muted small">{{ accidentals }}</span>
      </div>
    </div>
    <StaffNotation clef="treble" :notes="[]" :key-signature="selected" :width="220" />
  </div>
</template>

<style scoped>
.circle-wrap {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 1rem;
}
.circle {
  position: relative;
  width: min(100%, 320px);
  aspect-ratio: 1;
  border-radius: 50%;
  border: 1px solid var(--line);
}
.ring {
  position: absolute;
  inset: 0;
  transform: rotate(var(--rot));
  transition: transform 0.7s cubic-bezier(0.3, 0.7, 0.2, 1);
}
.marker {
  position: absolute;
  left: 50%;
  top: -7px;
  width: 0;
  height: 0;
  transform: translateX(-50%);
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-top: 8px solid var(--accent);
}
.major {
  position: absolute;
  transform: translate(-50%, -50%) rotate(calc(-1 * var(--rot)));
  transition:
    transform 0.7s cubic-bezier(0.3, 0.7, 0.2, 1),
    background-color 0.3s,
    border-color 0.3s;
  min-width: 2.6rem;
  height: 2.6rem;
  padding: 0 0.3rem;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-family: var(--display);
  font-size: 1.15rem;
  font-weight: 400;
  cursor: pointer;
}
.major small {
  font-family: var(--sans);
  font-weight: 500;
  font-size: 0.7rem;
}
.major.on {
  border-color: var(--series);
  background: var(--series);
  color: var(--on-accent);
}
.major.near {
  background: var(--accent-soft);
  border-color: var(--accent);
}
.minor {
  position: absolute;
  transform: translate(-50%, -50%) rotate(calc(-1 * var(--rot)));
  transition:
    transform 0.7s cubic-bezier(0.3, 0.7, 0.2, 1),
    color 0.3s;
  font-size: 0.8rem;
  color: var(--muted);
}
.minor.near {
  color: var(--accent-ink);
}
.center {
  position: absolute;
  inset: 32%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  line-height: 1.2;
}
.small {
  font-size: 0.75rem;
}
</style>
