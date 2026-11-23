<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { audio, type PlayedSound } from '@/audio/engine'
import { listTimbres } from '@/audio/instruments'
import { responseTimeMs } from '@/audio/timing'
import { midiToName } from '@/music/pitch'

const unlocked = ref(audio.isRunning)
const volume = ref(0.8)
const timbre = ref('complex')
const timbres = listTimbres()
const lastNote = ref<string | null>(null)
const current = ref<PlayedSound | null>(null)
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
  <p class="muted">Use headphones in a quiet room. Set a comfortable volume before training.</p>

  <section v-if="!unlocked" class="card">
    <button class="btn btn-primary" @click="unlock">Enable audio</button>
  </section>

  <template v-else>
    <section class="card stack">
      <label>
        Volume
        <input v-model.number="volume" type="range" min="0" max="1" step="0.01" />
      </label>
      <label>
        Timbre
        <select v-model="timbre">
          <option v-for="t in timbres" :key="t.id" :value="t.id">{{ t.label }}</option>
        </select>
      </label>
      <div class="row">
        <button class="btn btn-primary" @click="playRandom">Play random note</button>
        <span v-if="lastNote" class="muted">Last: {{ lastNote }}</span>
      </div>
    </section>

    <section class="card stack">
      <h2>Interference sounds</h2>
      <p class="muted">
        Played before blocks without feedback to clear any remembered reference tone.
      </p>
      <div class="row">
        <button class="btn" :disabled="busy !== null" @click="playInterference('shepard')">
          Shepard glissando (15 s)
        </button>
        <button class="btn" :disabled="busy !== null" @click="playInterference('noise')">
          Noise (2 s)
        </button>
        <button class="btn" :disabled="busy === null" @click="stop">Stop</button>
      </div>
    </section>

    <section class="card stack">
      <h2>Reaction time</h2>
      <p class="muted">
        Press <kbd>Space</kbd> or tap the button as soon as you hear the tone ({{ rtRounds }}
        rounds).
      </p>
      <div class="row">
        <button v-if="rtState === 'idle'" class="btn btn-primary" @click="startRt">Start</button>
        <button v-else class="btn btn-primary big" @pointerdown="respond">
          {{ rtState === 'waiting' ? 'Wait for it…' : 'Now!' }}
        </button>
      </div>
      <p v-if="rts.length">
        {{ rts.join(' ms, ') }} ms
        <strong v-if="meanRt !== null && rtState === 'idle'"> — mean {{ meanRt }} ms</strong>
      </p>
    </section>
  </template>
</template>

<style scoped>
.stack {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-bottom: 1rem;
}
.stack h2 {
  margin: 0;
  font-size: 1.1rem;
}
.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
}
label {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.big {
  min-width: 12rem;
  min-height: 3.5rem;
}
</style>
