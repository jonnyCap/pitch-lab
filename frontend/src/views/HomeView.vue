<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { SAMPLE_CREDITS } from '@/audio/sampleSets'
import PitchHelix from '@/components/PitchHelix.vue'

const tiles = [
  {
    to: '/trainer',
    no: '01',
    title: 'Absolute pitch',
    text: 'Name notes without a reference. 3\u00a0→\u00a012 pitches, multiple timbres and octaves.',
    spec: '12 pitch classes · 3 octaves',
  },
  {
    to: '/learn',
    no: '02',
    title: 'Fundamentals',
    text: 'Notes & staff, intervals, scales, keys, chords and rhythm.',
    spec: 'Notation · spaced review',
  },
  {
    to: '/audio-check',
    no: '03',
    title: 'Audio check',
    text: 'Test your headphones, volume and response timing.',
    spec: 'Calibration · latency',
  },
]
</script>

<template>
  <section class="hero">
    <div class="copy">
      <p class="kicker eyebrow">An ear-training journal</p>
      <h1>Train your <em>ear.</em><br />Learn the language of music.</h1>
      <p class="lede">
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

  <nav class="entries" aria-label="Sections">
    <RouterLink v-for="t in tiles" :key="t.to" :to="t.to" class="entry">
      <span class="no">{{ t.no }}</span>
      <span class="body">
        <h2>{{ t.title }}</h2>
        <span class="text">{{ t.text }}</span>
        <span class="spec">{{ t.spec }}</span>
      </span>
      <span class="arrow" aria-hidden="true">→</span>
    </RouterLink>
  </nav>

  <aside class="note">
    <p class="kicker">Honest expectations</p>
    <blockquote>
      In published studies most adults learned to name about
      <em>7–9 of 12 pitches</em> after 20–40 hours of training, and roughly <em>15–20%</em> reached
      full absolute-pitch performance.
    </blockquote>
  </aside>
  <p v-if="SAMPLE_CREDITS.length" class="muted credits">
    Instrument samples: {{ SAMPLE_CREDITS.join(' · ') }}
  </p>
</template>

<style scoped>
.hero {
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  align-items: center;
  gap: 2rem;
  margin: 1rem 0 4rem;
}
.eyebrow {
  margin: 0 0 1.25rem;
}
h1 {
  font-size: clamp(2.3rem, 4.4vw, 3.3rem);
  line-height: 0.98;
  letter-spacing: -0.02em;
  margin: 0 0 1.5rem;
}
h1 em {
  color: var(--accent-ink);
}
.lede {
  max-width: 32rem;
  margin: 0 0 2rem;
  font-size: 1.08rem;
  color: var(--muted);
}
.cta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}
.viz {
  max-width: 420px;
  justify-self: center;
}
.viz :deep(figcaption) {
  font-family: var(--display);
  font-size: 0.95rem;
  font-variant-caps: normal;
  letter-spacing: 0;
  text-align: center;
}

.entries {
  border-top: 1px solid var(--text);
}
.entry {
  display: grid;
  grid-template-columns: 3.5rem 1fr auto;
  align-items: baseline;
  gap: 1rem;
  padding: 1.6rem 0;
  border-bottom: 1px solid var(--line);
  color: inherit;
  text-decoration: none;
  transition: padding-left 0.35s var(--ease-out);
}
.entry:hover {
  padding-left: 0.5rem;
}
.no {
  font-family: var(--display);
  font-size: 1.1rem;
  color: var(--muted);
}
.body {
  display: grid;
  gap: 0.25rem;
}
.entry h2 {
  margin: 0;
  font-size: 1.5rem;
}
.entry:hover h2 {
  color: var(--accent-ink);
}
.text {
  color: var(--muted);
  max-width: 34rem;
}
.spec {
  font-size: 0.8rem;
  text-transform: uppercase;
  font-size: 0.72rem;
  font-weight: 500;
  letter-spacing: 0.06em;
  color: var(--muted);
  margin-top: 0.35rem;
}
.arrow {
  font-size: 1.4rem;
  color: var(--muted);
  transition:
    transform 0.3s var(--ease-out),
    color 0.2s;
}
.entry:hover .arrow {
  transform: translateX(6px);
  color: var(--accent-ink);
}

.note {
  margin: 4rem 0 0;
  max-width: 40rem;
}
blockquote {
  margin: 0.6rem 0 0;
  padding-left: 1.25rem;
  border-left: 2px solid var(--accent);
  font-family: var(--display);
  font-size: clamp(1.2rem, 2.4vw, 1.45rem);
  line-height: 1.2;
  letter-spacing: -0.01em;
}
blockquote em {
  color: var(--accent-ink);
}
.credits {
  font-size: 0.75rem;
  margin-top: 3rem;
}

@media (max-width: 720px) {
  .hero {
    grid-template-columns: 1fr;
    gap: 1rem;
    margin-bottom: 3rem;
  }
  .viz {
    order: -1;
    max-width: 240px;
    margin: -0.5rem auto 0;
  }
  .viz :deep(figcaption) {
    display: none;
  }
  .entry {
    grid-template-columns: 2.2rem 1fr auto;
    padding: 1.3rem 0;
  }
  .entry h2 {
    font-size: 1.8rem;
  }
}
</style>
