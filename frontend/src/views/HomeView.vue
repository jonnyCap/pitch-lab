<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <section class="hero">
    <h1>Train your ear. Learn the language of music.</h1>
    <p class="muted">
      Pitch Lab teaches music fundamentals and trains absolute pitch with a protocol built on the
      latest adult-learning research (Wong et al. 2020 &amp; 2025, Van Hedger et al. 2019).
    </p>
  </section>

  <div class="grid">
    <RouterLink to="/trainer" class="card tile">
      <h2>Absolute pitch</h2>
      <p class="muted">
        Name notes without a reference. 3 → 12 pitches, multiple timbres and octaves.
      </p>
    </RouterLink>
    <RouterLink to="/learn" class="card tile">
      <h2>Fundamentals</h2>
      <p class="muted">Notes &amp; staff, intervals, scales, keys, chords and rhythm.</p>
    </RouterLink>
    <RouterLink to="/audio-check" class="card tile">
      <h2>Audio check</h2>
      <p class="muted">Test your headphones, volume and response timing.</p>
    </RouterLink>
  </div>

  <p class="muted note">
    Honest expectations: in published studies most adults learned to name about 7–9 of 12 pitches
    after 20–40 hours of training, and roughly 15–20% reached full absolute-pitch performance.
  </p>
</template>

<style scoped>
.hero h1 {
  font-size: clamp(1.6rem, 4vw, 2.4rem);
  margin: 0.5rem 0;
}
.tile {
  color: inherit;
  text-decoration: none;
  transition: border-color 0.15s;
}
.tile:hover {
  border-color: var(--accent);
}
.tile h2 {
  margin: 0 0 0.25rem;
  font-size: 1.15rem;
}
.note {
  margin-top: 2rem;
  font-size: 0.9rem;
}
</style>
