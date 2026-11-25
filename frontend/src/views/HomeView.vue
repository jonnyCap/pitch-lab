<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { SAMPLE_CREDITS } from '@/audio/sampleSets'
import PitchHelix from '@/components/PitchHelix.vue'
import { vTilt } from '@/lib/tilt'

const tiles = [
  {
    to: '/trainer',
    no: '01',
    title: 'Absolute pitch',
    text: 'Name notes without a reference. 3\u00a0→\u00a012 pitches, multiple timbres and octaves.',
    spec: '12 PC · 3 OCT',
  },
  {
    to: '/learn',
    no: '02',
    title: 'Fundamentals',
    text: 'Notes & staff, intervals, scales, keys, chords and rhythm.',
    spec: 'SRS · NOTATION',
  },
  {
    to: '/audio-check',
    no: '03',
    title: 'Audio check',
    text: 'Test your headphones, volume and response timing.',
    spec: 'CAL · LATENCY',
  },
]
</script>

<template>
  <section class="hero">
    <div class="copy">
      <p class="label eyebrow"><span class="led" />Ear-training instrument</p>
      <h1>Train your ear.<br />Learn the language of music.</h1>
      <p class="lede muted">
        Pitch Lab teaches music fundamentals and trains absolute pitch with a protocol built on the
        latest adult-learning research (Wong et al. 2020 &amp; 2025, Van Hedger et al. 2019).
      </p>
      <div class="cta">
        <RouterLink to="/trainer" class="btn btn-primary">Start training</RouterLink>
        <RouterLink to="/learn" class="btn">Learn the basics</RouterLink>
      </div>
    </div>
    <PitchHelix class="viz" />
  </section>

  <div class="tiles">
    <RouterLink v-for="t in tiles" :key="t.to" v-tilt :to="t.to" class="card tile">
      <div class="tile-head">
        <span class="label">{{ t.no }}</span>
        <span class="label">{{ t.spec }}</span>
      </div>
      <h2>{{ t.title }}</h2>
      <p class="muted">{{ t.text }}</p>
      <span class="arrow" aria-hidden="true">→</span>
    </RouterLink>
  </div>

  <aside class="note">
    <span class="label">Honest expectations</span>
    <p>
      In published studies most adults learned to name about
      <strong>7–9 of 12 pitches</strong> after 20–40 hours of training, and roughly
      <strong>15–20%</strong> reached full absolute-pitch performance.
    </p>
  </aside>
  <p v-if="SAMPLE_CREDITS.length" class="muted credits">
    Instrument samples: {{ SAMPLE_CREDITS.join(' · ') }}
  </p>
</template>

<style scoped>
.hero {
  display: grid;
  grid-template-columns: 1.15fr 1fr;
  align-items: center;
  gap: 1rem;
  margin: 0.5rem 0 2rem;
}
.eyebrow {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0 0 1rem;
}
.led {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
  animation: pulse 2.4s ease-in-out infinite;
}
@keyframes pulse {
  50% {
    box-shadow: 0 0 0 6px transparent;
  }
}
h1 {
  font-size: clamp(2rem, 5.2vw, 3.1rem);
  letter-spacing: -0.035em;
  margin: 0 0 1rem;
}
.lede {
  max-width: 34rem;
  margin: 0 0 1.5rem;
}
.cta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
}
.viz {
  max-width: 420px;
  justify-self: center;
}

.tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 0.75rem;
}
.tile {
  display: flex;
  flex-direction: column;
  color: inherit;
  text-decoration: none;
  overflow: hidden;
  transition:
    transform 0.35s var(--ease-out),
    border-color 0.2s,
    box-shadow 0.35s var(--ease-out);
  will-change: transform;
}
/* Soft light that follows the pointer (set by v-tilt). */
.tile::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(
    260px circle at var(--mx, 50%) var(--my, 0%),
    var(--accent-soft),
    transparent 70%
  );
  opacity: 0;
  transition: opacity 0.3s;
  pointer-events: none;
}
.tile:hover {
  border-color: var(--muted);
  box-shadow: var(--shadow);
}
.tile:hover::before {
  opacity: 1;
}
.tile-head {
  display: flex;
  justify-content: space-between;
  padding-bottom: 0.75rem;
  margin-bottom: 0.9rem;
  border-bottom: 1px solid var(--line);
}
.tile h2 {
  margin: 0 0 0.3rem;
  font-size: 1.2rem;
}
.tile p {
  margin: 0 0 1.25rem;
  font-size: 0.92rem;
}
.arrow {
  margin-top: auto;
  font-size: 1.2rem;
  color: var(--muted);
  transition:
    transform 0.3s var(--ease-out),
    color 0.2s;
}
.tile:hover .arrow {
  transform: translateX(6px);
  color: var(--accent-ink);
}

.note {
  margin-top: 2rem;
  padding: 1rem 0 0;
  border-top: 1px solid var(--border);
  display: grid;
  grid-template-columns: 11rem 1fr;
  gap: 1rem;
}
.note p {
  margin: 0;
  font-size: 0.92rem;
}
.credits {
  font-size: 0.72rem;
  margin-top: 1.5rem;
}

@media (max-width: 720px) {
  .hero {
    grid-template-columns: 1fr;
  }
  .viz {
    order: -1;
    max-width: 230px;
    margin: -1rem auto -0.5rem;
  }
  .viz :deep(figcaption) {
    display: none;
  }
  .note {
    grid-template-columns: 1fr;
    gap: 0.4rem;
  }
}
</style>
