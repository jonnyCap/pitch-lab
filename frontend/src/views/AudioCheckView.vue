<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { audio, type PlayedSound } from '@/audio/engine'
import { listTimbres } from '@/audio/instruments'
import { responseTimeMs } from '@/audio/timing'
import { midiToName } from '@/music/pitch'
import { CountUp } from '@/components/game'
import { shake } from '@/lib/fx'

const unlocked = ref(audio.isRunning)
const volume = ref(0.8)
const timbre = ref('complex')
const timbres = listTimbres()
const lastNote = ref<string | null>(null)
const current = ref<PlayedSound | null>(null)
const targetEl = ref<HTMLElement | null>(null)
const busy = ref<'shepard' | 'noise' | null>(null)

watch(volume, (v) => audio.setVolume(v))

async function unlock() {
  await audio.unlock()
  unlocked.value = true
}

async function playRandom() {
  const midi = 60 + Math.floor(Math.random() * 24) // C4–B5
  current.value?.stop()
  current.value = await audio.playTone(timbre.value, midi)
  lastNote.value = midiToName(midi)
}

async function playInterference(kind: 'shepard' | 'noise') {
  current.value?.stop()
  busy.value = kind
  const s = kind === 'shepard' ? await audio.playShepard(15) : await audio.playNoise(2)
  current.value = s
  await s.ended
  if (current.value === s) busy.value = null
}

function stop() {
  current.value?.stop()
  busy.value = null
}

// --- Reaction-time check -------------------------------------------------
const rtRounds = 5
const rts = ref<number[]>([])
const rtState = ref<'idle' | 'waiting' | 'playing'>('idle')
let onset = 0
let timer: ReturnType<typeof setTimeout> | undefined

const meanRt = computed(() =>
  rts.value.length ? Math.round(rts.value.reduce((a, b) => a + b, 0) / rts.value.length) : null,
)

function startRt() {
  rts.value = []
  nextRt()
}

function nextRt() {
  rtState.value = 'waiting'
  timer = setTimeout(
    async () => {
      const s = await audio.playTone(timbre.value, 69)
      onset = s.onsetPerfMs
      rtState.value = 'playing'
    },
    1000 + Math.random() * 2000,
  )
}

function respond(e: Event) {
  if (rtState.value === 'waiting') {
    // Too early: nudge and wait again.
    clearTimeout(timer)
    if (targetEl.value) shake(targetEl.value)
    nextRt()
    return
  }
  if (rtState.value !== 'playing') return
  rts.value.push(responseTimeMs(onset, e.timeStamp))
  if (rts.value.length < rtRounds) nextRt()
  else rtState.value = 'idle'
}

function onKey(e: KeyboardEvent) {
  if (e.code === 'Space' && rtState.value !== 'idle') {
    e.preventDefault()
    respond(e)
  }
}
window.addEventListener('keydown', onKey)
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  clearTimeout(timer)
  current.value?.stop()
})
</script>

<template>
  <h1>Audio check</h1>
  <p class="dek">Headphones, a quiet room, a comfortable volume.</p>

  <section v-if="!unlocked" class="card unlock">
    <button class="btn btn-primary" @click="unlock">Enable audio</button>
  </section>

  <div v-else class="cards">
    <section class="card">
      <p class="kicker">01 · Volume</p>
      <div class="note" aria-live="polite">
        <span :key="lastNote ?? 'none'" class="name">{{ lastNote ?? '–' }}</span>
      </div>
      <label class="fader">
        <span class="sr">Volume</span>
        <input v-model.number="volume" type="range" min="0" max="1" step="0.01" />
        <output>{{ Math.round(volume * 100) }}</output>
      </label>
      <div class="row">
        <button class="btn btn-primary" @click="playRandom">Play random note</button>
        <select v-model="timbre" aria-label="Timbre">
          <option v-for="t in timbres" :key="t.id" :value="t.id">{{ t.label }}</option>
        </select>
      </div>
    </section>

    <section class="card">
      <p class="kicker">02 · Interference</p>
      <h2>Reset your ear</h2>
      <p class="muted">Played before blocks without feedback.</p>
      <div class="row">
        <button class="btn" :disabled="busy !== null" @click="playInterference('shepard')">
          Shepard glissando (15 s)
        </button>
        <button class="btn" :disabled="busy !== null" @click="playInterference('noise')">
          Noise (2 s)
        </button>
        <button class="btn btn-ghost" :disabled="busy === null" @click="stop">Stop</button>
      </div>
    </section>

    <section class="card">
      <p class="kicker">03 · Reaction time</p>
      <button
        v-if="rtState === 'idle'"
        class="target idle"
        :aria-label="rts.length ? 'Play again' : 'Start'"
        @click="startRt"
      >
        {{ rts.length ? 'Again' : 'Start' }}
      </button>
      <button
        v-else
        ref="targetEl"
        class="target"
        :class="rtState"
        aria-label="React"
        @pointerdown.prevent="respond"
      >
        {{ rtState === 'waiting' ? 'Wait' : 'Now' }}
      </button>
      <div class="rounds" aria-label="Rounds">
        <span v-for="n in rtRounds" :key="`rt-${n}`" class="round">
          <i :class="{ on: n <= rts.length }" />
          <small>{{ rts[n - 1] ?? '' }}</small>
        </span>
      </div>
      <p v-if="meanRt !== null && rtState === 'idle'" class="mean">
        <CountUp :value="meanRt" /> <span class="muted">ms mean</span>
      </p>
      <p v-else class="muted hint">
        Tap the circle, or press <kbd>Space</kbd>, when you hear the tone.
      </p>
    </section>
  </div>
</template>

<style scoped>
.dek {
  font-family: var(--display);
  font-size: 1.3rem;
  color: var(--muted);
  margin: 0.25rem 0 1.5rem;
}
.cards {
  display: grid;
  gap: 1rem;
}
.card {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  align-items: flex-start;
}
.card > * {
  margin: 0;
}
.card h2 {
  font-size: 1.8rem;
}
.kicker {
  text-transform: uppercase;
  font-size: 0.72rem;
  font-weight: 500;
  letter-spacing: 0.08em;
}
.unlock {
  align-items: center;
}
.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6rem;
}
.note {
  height: 4.5rem;
  display: flex;
  align-items: center;
}
.name {
  font-family: var(--display);
  font-size: 3.2rem;
  line-height: 1;
  animation: pop 0.3s var(--ease-out);
}
@keyframes pop {
  from {
    opacity: 0;
    transform: translateY(6px) scale(0.96);
  }
}
.sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}
.fader {
  display: flex;
  align-items: center;
  gap: 0.9rem;
  width: 100%;
}
.fader input {
  flex: 1;
  appearance: none;
  height: 1px;
  background: var(--text);
  outline-offset: 8px;
}
.fader input::-webkit-slider-thumb {
  appearance: none;
  width: 14px;
  height: 26px;
  background: var(--surface);
  border: 1px solid var(--text);
  border-radius: 2px;
  box-shadow:
    inset 0 0 0 5px var(--surface),
    inset 0 -1px 0 var(--text),
    0 2px 0 var(--line);
  cursor: grab;
}
.fader input::-moz-range-thumb {
  width: 12px;
  height: 24px;
  background: var(--surface);
  border: 1px solid var(--text);
  border-radius: 2px;
  cursor: grab;
}
.fader output {
  font-family: var(--mono);
  font-size: 0.85rem;
  width: 2.2rem;
  text-align: right;
}
.target {
  align-self: center;
  width: 11rem;
  height: 11rem;
  border-radius: 50%;
  border: 1px solid var(--text);
  background: var(--surface);
  color: var(--text);
  font-family: var(--display);
  font-size: 1.6rem;
  cursor: pointer;
  touch-action: manipulation;
  user-select: none;
  transition:
    background-color 0.12s,
    color 0.12s,
    transform 0.12s var(--ease-out),
    border-color 0.12s;
}
.target.idle:hover {
  border-color: var(--accent);
  color: var(--accent-ink);
}
.target.waiting {
  border-style: dashed;
  color: var(--muted);
}
.target.playing {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--on-accent);
  transform: scale(1.05);
}
.rounds {
  display: flex;
  gap: 1rem;
  align-self: center;
}
.round {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
}
.round i {
  width: 0.7rem;
  height: 0.7rem;
  border-radius: 50%;
  border: 1px solid var(--muted);
  transition: background-color 0.2s;
}
.round i.on {
  background: var(--accent);
  border-color: var(--accent);
}
.round small {
  font-family: var(--mono);
  font-size: 0.7rem;
  color: var(--muted);
  min-height: 1em;
}
.mean {
  align-self: center;
  font-family: var(--display);
  font-size: 2.4rem;
  line-height: 1;
}
.mean .muted {
  font-family: var(--sans);
  font-size: 0.9rem;
}
.hint {
  align-self: center;
  font-size: 0.85rem;
  text-align: center;
}
@media (min-width: 760px) {
  .cards {
    grid-template-columns: 1fr 1fr;
  }
  .cards > :last-child {
    grid-column: 1 / -1;
  }
}
</style>
