<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, RouterView } from 'vue-router'
import { Toaster } from 'vue-sonner'
import ReloadPrompt from '@/components/ReloadPrompt.vue'
import { cycleTheme, themePref } from '@/lib/theme'

const themeLabel = computed(
  () => ({ auto: 'Theme: system', light: 'Theme: light', dark: 'Theme: dark' })[themePref.value],
)
</script>

<template>
  <header class="topbar">
    <div class="bar">
      <RouterLink to="/" class="brand" aria-label="Pitch Lab home">
        <svg class="mark" viewBox="0 0 32 32" aria-hidden="true">
          <circle cx="16" cy="16" r="15" />
          <path d="M16 4v12l7.5 5" />
          <circle class="dot" cx="16" cy="16" r="2.4" />
        </svg>
        <span>Pitch<span class="lab">Lab</span></span>
      </RouterLink>
      <nav>
        <RouterLink to="/trainer">Trainer</RouterLink>
        <RouterLink to="/learn">Learn</RouterLink>
        <RouterLink to="/progress">Progress</RouterLink>
      </nav>
      <button
        type="button"
        class="theme"
        :title="themeLabel"
        :aria-label="`${themeLabel} (click to change)`"
        @click="cycleTheme"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <template v-if="themePref === 'light'">
            <circle cx="12" cy="12" r="4.5" />
            <path
              d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"
            />
          </template>
          <path
            v-else-if="themePref === 'dark'"
            d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z"
          />
          <template v-else>
            <circle cx="12" cy="12" r="8.5" />
            <path class="fill" d="M12 3.5a8.5 8.5 0 0 1 0 17Z" />
          </template>
        </svg>
      </button>
    </div>
  </header>
  <main class="container">
    <RouterView v-slot="{ Component, route }">
      <Transition name="page" mode="out-in">
        <div :key="String(route.name)">
          <component :is="Component" />
        </div>
      </Transition>
    </RouterView>
  </main>
  <ReloadPrompt />
  <Toaster position="bottom-center" />
</template>

<style scoped>
.topbar {
  position: sticky;
  top: 0;
  z-index: 10;
  border-bottom: 1px solid var(--border);
  background: color-mix(in srgb, var(--bg) 82%, transparent);
  backdrop-filter: blur(10px) saturate(1.2);
  -webkit-backdrop-filter: blur(10px) saturate(1.2);
}
.bar {
  max-width: 960px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.6rem 1rem;
}
.brand {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text);
  text-decoration: none;
  margin-right: auto;
}
.lab {
  color: var(--accent-ink);
  margin-left: 1px;
}
.mark {
  width: 26px;
  height: 26px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
}
.mark path {
  stroke: var(--accent);
  stroke-width: 2.2;
  transform-origin: 16px 16px;
  transition: transform 0.6s var(--ease-spring);
}
.brand:hover .mark path {
  transform: rotate(60deg);
}
.mark .dot {
  fill: currentColor;
  stroke: none;
}
nav {
  display: flex;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--border);
  border-radius: calc(var(--radius) + 2px);
  background: var(--surface);
}
nav a {
  font-family: var(--mono);
  font-size: 0.72rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted);
  text-decoration: none;
  padding: 0.35rem 0.65rem;
  border-radius: var(--radius);
  transition:
    color 0.15s,
    background-color 0.15s;
}
nav a:hover {
  color: var(--text);
}
nav a.router-link-active {
  color: var(--text);
  background: var(--raised);
  box-shadow:
    inset 0 0 0 1px var(--border),
    0 1px 0 var(--key-shadow);
}
nav a.router-link-active::before {
  content: '';
  display: inline-block;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--accent);
  margin-right: 0.4rem;
  vertical-align: 0.12em;
  box-shadow: 0 0 6px var(--accent);
}
.theme {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
  padding: 0;
}
.theme:hover {
  border-color: var(--muted);
}
.theme svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
}
.theme .fill {
  fill: currentColor;
  stroke: none;
}
@media (max-width: 480px) {
  .brand > span {
    display: none;
  }
  nav a {
    padding: 0.35rem 0.5rem;
  }
}
</style>
