<script setup lang="ts">
/** Three swipeable cards: sound check → how training works → baseline. Emits `done(withPitchMemory)`. */
import { ref, watch } from 'vue'
import { audio } from '@/audio/engine'
import { midiOf, type PitchClass } from '@/music/pitch'
import { SwipeCards } from '@/components/game'
import JIcon from '@/components/ap/journey/JIcon.vue'
import { dur } from '@/lib/motion'

const props = defineProps<{ timbre: string }>()
const emit = defineEmits<{ done: [withPitchMemory: boolean] }>()

const step = ref(0)
const volume = ref(0.8)
const playing = ref(false)
watch(volume, (v) => audio.setVolume(v))

async function testTone() {
  await audio.unlock()
  const pc = Math.floor(Math.random() * 12) as PitchClass
  playing.value = true
  setTimeout(() => (playing.value = false), 900)
  await audio.playTone(props.timbre, midiOf(pc, 4))
}

/** Ladder tiers 3 → 12: one column of dots per tier. */
const tiers = Array.from({ length: 10 }, (_, i) => i + 3)
const delay = (i: number) => `${dur(70 * i + 150)}ms`
</script>

<template>
  <section class="onboarding">
    <SwipeCards v-model="step" :count="3">
      <template #step-0="{ next }">
        <div class="pane">
          <JIcon name="headphones" :size="30" class="hero-icon" />
          <h2>Set up your <em>sound</em></h2>
          <p class="lede">Headphones, a quiet room, a comfortable volume.</p>
          <div class="play-wrap">
            <button
              type="button"
              class="play"
              :class="{ on: playing }"
              aria-label="Test tone"
              @click="testTone"
            >
              <JIcon name="play" :size="30" />
            </button>
          </div>
          <label class="fader">
            <span class="muted">Volume</span>
            <input v-model.number="volume" type="range" min="0" max="1" step="0.01" />
          </label>
          <p class="hint muted">Keep the app in the foreground — switching apps stops a level.</p>
          <div class="actions">
            <button class="btn btn-primary" @click="next">Sounds good</button>
          </div>
        </div>
      </template>

      <template #step-1="{ next, prev }">
        <div class="pane">
          <h2>Three notes. <em>Then twelve.</em></h2>
          <p class="lede">Add one note at a time. Name it right, 9 times in 10, to move on.</p>
          <figure class="ladder" aria-label="Ladder from 3 to 12 notes">
            <svg viewBox="0 0 300 112" role="img" aria-label="Notes grow from 3 to 12">
              <g
                v-for="(t, i) in tiers"
                :key="`tier-${t}`"
                class="col"
                :style="{ animationDelay: delay(i) }"
              >
                <circle
                  v-for="k in t"
                  :key="`dot-${t}-${k}`"
                  :cx="16 + i * 30.4"
                  :cy="104 - (k - 1) * 8.6"
                  r="3.4"
                  :class="{ top: i === tiers.length - 1 }"
                />
              </g>
              <line x1="4" y1="110" x2="296" y2="110" class="axis" />
            </svg>
            <div class="legend">
              <span><i class="sw solid" /> with feedback</span>
              <span><i class="sw dashed" /> without feedback</span>
              <span class="pass">90% to pass</span>
            </div>
          </figure>
          <div class="bignums">
            <div>
              <span class="big">7–9</span>
              <span class="muted">of 12 notes, reliably</span>
            </div>
            <div>
              <span class="big">20–40</span>
              <span class="muted">hours over ~8 weeks</span>
            </div>
          </div>
          <details>
            <summary>Fair-play rules</summary>
            <ul>
              <li>Each step is played twice: first with feedback, then without.</li>
              <li>A note one semitone off counts as wrong.</li>
              <li>Steps add octaves and instruments, so you learn the note, not how high it is.</li>
              <li>Before steps without feedback, a 15-second sliding tone clears your memory.</li>
              <li>
                Don't hum, use reference songs or a tuning fork, and don't compare to the previous
                note. Just name what you hear.
              </li>
              <li>
                About 30 minutes a day, 4–5 days a week. Around 15–20% in the studies reached the
                level of natural absolute pitch.
              </li>
            </ul>
          </details>
          <div class="actions">
            <button class="btn btn-ghost" @click="prev">Back</button>
            <button class="btn btn-primary" @click="next">Got it</button>
          </div>
        </div>
      </template>

      <template #step-2="{ prev }">
        <div class="pane">
          <h2>Measure your <em>starting point</em></h2>
          <p class="lede">Most people score near chance at first. That is the point.</p>
          <ul class="facts">
            <li>
              <JIcon name="notes" />
              <strong>96</strong>
              <span class="muted">notes</span>
            </li>
            <li>
              <JIcon name="clock" />
              <strong>~12</strong>
              <span class="muted">minutes</span>
            </li>
            <li>
              <JIcon name="eye-off" />
              <strong>No</strong>
              <span class="muted">feedback</span>
            </li>
          </ul>
          <div class="actions col-actions">
            <button class="btn btn-primary" @click="emit('done', false)">
              Start the baseline test
            </button>
            <button class="btn" @click="emit('done', true)">3-min pitch memory check first</button>
            <button class="btn btn-ghost" @click="prev">Back</button>
          </div>
        </div>
      </template>
    </SwipeCards>
  </section>
</template>

<style scoped>
.onboarding :deep(.stage) {
  padding: 1px;
}
.onboarding {
  margin-top: 1.25rem;
  max-width: 560px;
  margin-inline: auto;
}
.pane {
  padding: 0.5rem 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 0.9rem;
  min-height: 25rem;
}
h2 {
  font-family: var(--serif);
  font-weight: 400;
  font-size: clamp(2rem, 7vw, 2.8rem);
  line-height: 1.02;
  letter-spacing: -0.02em;
  margin: 0;
}
h2 em {
  color: var(--accent-ink);
}
.lede {
  margin: 0;
  color: var(--muted);
  max-width: 28rem;
}
.hero-icon {
  color: var(--accent-ink);
}
.play-wrap {
  margin: 0.5rem 0 0.25rem;
}
.play {
  position: relative;
  display: grid;
  place-items: center;
  width: 84px;
  height: 84px;
  border-radius: 50%;
  border: 0;
  background: var(--accent);
  color: var(--on-accent);
  cursor: pointer;
  transition: transform 0.15s var(--ease-out);
}
.play:hover {
  transform: scale(1.04);
}
.play:active {
  transform: scale(0.96);
}
.play :deep(svg) {
  margin-left: 4px;
}
.play::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 1px solid var(--accent);
  opacity: 0;
}
.play.on::after {
  animation: ping 0.9s var(--ease-out);
}
@keyframes ping {
  from {
    opacity: 0.7;
    transform: scale(1);
  }
  to {
    opacity: 0;
    transform: scale(1.7);
  }
}
.fader {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: min(100%, 18rem);
}
.fader input {
  flex: 1;
  appearance: none;
  height: 22px;
  background: transparent;
  cursor: pointer;
}
.fader input::-webkit-slider-runnable-track {
  height: 1px;
  background: var(--text);
}
.fader input::-moz-range-track {
  height: 1px;
  background: var(--text);
}
.fader input::-webkit-slider-thumb {
  appearance: none;
  width: 12px;
  height: 22px;
  margin-top: -10px;
  border-radius: 2px;
  background: var(--accent);
  border: 0;
}
.fader input::-moz-range-thumb {
  width: 12px;
  height: 22px;
  border-radius: 2px;
  background: var(--accent);
  border: 0;
}
.hint {
  margin: 0;
  font-size: 0.85rem;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: 0.75rem;
  margin-top: auto;
  padding-top: 0.5rem;
}
.col-actions {
  flex-direction: column;
  width: min(100%, 20rem);
}
.col-actions .btn {
  width: 100%;
}

.ladder {
  margin: 0;
  width: 100%;
}
.ladder svg {
  width: 100%;
  max-width: 340px;
  height: auto;
}
.col circle {
  fill: var(--text);
}
.col circle.top {
  fill: var(--accent);
}
.col {
  opacity: 0;
  transform: translateY(6px);
  animation: rise 0.45s var(--ease-out) forwards;
}
@keyframes rise {
  to {
    opacity: 1;
    transform: none;
  }
}
.axis {
  stroke: var(--border);
  stroke-width: 0.6;
}
.legend {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.4rem 1rem;
  font-size: 0.8rem;
  color: var(--muted);
  margin-top: 0.35rem;
}
.sw {
  display: inline-block;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  margin-right: 4px;
  border: 1px solid var(--text);
  vertical-align: -1px;
}
.sw.solid {
  background: var(--text);
}
.sw.dashed {
  border-style: dashed;
}
.pass {
  color: var(--accent-ink);
}
.bignums {
  display: flex;
  justify-content: center;
  gap: 2.5rem;
}
.bignums > div {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.big {
  font-family: var(--serif);
  font-size: clamp(2.6rem, 10vw, 3.6rem);
  line-height: 1;
  letter-spacing: -0.02em;
}
.bignums .muted {
  font-size: 0.8rem;
}
details {
  width: 100%;
  text-align: left;
}
details ul {
  margin: 0.5rem 0 0;
  padding-left: 1.2rem;
  display: grid;
  gap: 0.35rem;
  font-size: 0.9rem;
}
.facts {
  list-style: none;
  padding: 0;
  margin: 0.5rem 0;
  display: flex;
  gap: 1.75rem;
  justify-content: center;
}
.facts li {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
  opacity: 0;
  animation: rise 0.45s var(--ease-out) forwards;
}
.facts li:nth-child(2) {
  animation-delay: 0.08s;
}
.facts li:nth-child(3) {
  animation-delay: 0.16s;
}
.facts :deep(svg) {
  color: var(--accent-ink);
  margin-bottom: 0.3rem;
}
.facts strong {
  font-family: var(--serif);
  font-weight: 400;
  font-size: 2.4rem;
  line-height: 1;
}
</style>
