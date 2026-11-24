<script setup lang="ts">
import { ref, watch } from 'vue'
import { audio } from '@/audio/engine'
import { midiOf, type PitchClass } from '@/music/pitch'

const props = defineProps<{ timbre: string }>()
const emit = defineEmits<{ done: [withPitchMemory: boolean] }>()

const step = ref(0)
const volume = ref(0.8)
watch(volume, (v) => audio.setVolume(v))

async function testTone() {
  await audio.unlock()
  const pc = Math.floor(Math.random() * 12) as PitchClass
  await audio.playTone(props.timbre, midiOf(pc, 4))
}
</script>

<template>
  <section class="card onboarding">
    <p class="muted stepno">Step {{ step + 1 }} of 3</p>

    <template v-if="step === 0">
      <h2>Set up your sound</h2>
      <ul>
        <li>Use headphones in a quiet room.</li>
        <li>Play a test tone and set a comfortable, clear volume.</li>
        <li>Keep the app in the foreground while a level runs: switching apps stops the level.</li>
      </ul>
      <div class="row">
        <button class="btn" @click="testTone">▶ Test tone</button>
        <label>
          Volume <input v-model.number="volume" type="range" min="0" max="1" step="0.01" />
        </label>
      </div>
      <button class="btn btn-primary next" @click="step = 1">Sounds good</button>
    </template>

    <template v-else-if="step === 1">
      <h2>How training works</h2>
      <ul>
        <li>
          You start with <strong>3 notes</strong> (E, F, F♯) and add one note at a time up to all
          12.
        </li>
        <li>
          Each step is played twice: first <strong>with feedback</strong>, then
          <strong>without</strong>. You need <strong>90%</strong> to pass, and a note that is one
          semitone off counts as wrong.
        </li>
        <li>
          Steps add more octaves and instruments, so you learn the note itself, not how high it is.
        </li>
        <li>
          Before steps without feedback, a 15-second sliding tone clears your memory, so you can't
          just compare against the last note you heard.
        </li>
      </ul>
      <h3>What to expect</h3>
      <p>
        In the published adult studies, people trained for <strong>20–40 hours</strong> over about 8
        weeks. Most learned to name roughly <strong>7–9 of 12 notes</strong> reliably, and around
        <strong>15–20%</strong> reached the level of people with natural absolute pitch. Train about
        30 minutes a day, 4–5 days a week.
      </p>
      <p class="muted">
        To keep training honest: don't hum, don't use reference songs or a tuning fork, and don't
        compare a note to the one before it. Just name what you hear.
      </p>
      <div class="row">
        <button class="btn" @click="step = 0">Back</button>
        <button class="btn btn-primary" @click="step = 2">Got it</button>
      </div>
    </template>

    <template v-else>
      <h2>Measure your starting point</h2>
      <p>
        A short test measures your baseline: 96 notes across 4 octaves and 2 instruments (one of
        which you will never train with), no feedback, about 12 minutes. Don't worry about guessing
        — most people score near chance at the start.
      </p>
      <div class="row">
        <button class="btn" @click="step = 1">Back</button>
        <button class="btn btn-primary" @click="emit('done', false)">Continue to the test</button>
        <button class="btn" @click="emit('done', true)">
          Optional: 3-minute pitch memory check first
        </button>
      </div>
    </template>
  </section>
</template>

<style scoped>
.onboarding h2 {
  margin-top: 0.25rem;
}
.stepno {
  margin: 0;
  font-size: 0.85rem;
}
ul {
  padding-left: 1.2rem;
  display: grid;
  gap: 0.4rem;
}
.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
  margin-top: 0.75rem;
}
label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.next {
  margin-top: 1rem;
}
</style>
