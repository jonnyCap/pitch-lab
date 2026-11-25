<script setup lang="ts">
/**
 * Interactive circle of fifths: major keys outside, relative minors inside.
 * Selecting a key shows its key signature and plays its major scale.
 */
import { computed, ref } from 'vue'
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
    <div class="circle" role="group" aria-label="Circle of fifths">
      <template v-for="(c, i) in CIRCLE" :key="c.major">
        <button
          type="button"
          class="major"
          :class="{ on: selected === c.major || selected === c.alt }"
          :style="pos(i, 41)"
          :aria-label="`${prettyPitch(c.major)} major`"
          @click="choose(c.major)"
        >
          {{ prettyPitch(c.major) }}<small v-if="c.alt">/{{ prettyPitch(c.alt) }}</small>
        </button>
        <span class="minor" :style="pos(i, 24)">{{
          prettyPitch(keyInfo(c.major).minor).toLowerCase()
        }}</span>
      </template>
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
  border: 1px solid var(--border);
}
.major {
  position: absolute;
  transform: translate(-50%, -50%);
  min-width: 2.6rem;
  height: 2.6rem;
  padding: 0 0.3rem;
  border-radius: 999px;
  border: 2px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
.major small {
  font-weight: 500;
  font-size: 0.7rem;
}
.major.on {
  border-color: var(--series);
  background: var(--series);
  color: var(--on-accent);
}
.minor {
  position: absolute;
  transform: translate(-50%, -50%);
  font-size: 0.8rem;
  color: var(--muted);
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
