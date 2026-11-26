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
        <span class="word">Pitch <em>Lab</em><i class="dot" /></span>
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
  border-bottom: 1px solid var(--line);
  background: color-mix(in srgb, var(--bg) 88%, transparent);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}
.bar {
  max-width: var(--page-width);
  margin: 0 auto;
  display: flex;
  align-items: center;
  gap: 1.5rem;
  padding: 0.7rem 1.25rem;
}
.brand {
  font-family: var(--display);
  font-size: 1.65rem;
  line-height: 1;
  letter-spacing: -0.02em;
  color: var(--text);
  text-decoration: none;
  margin-right: auto;
}
.brand em {
}
.dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  margin-left: 3px;
  border-radius: 50%;
  background: var(--accent);
  vertical-align: 0.05em;
  transition: transform 0.4s var(--ease-spring);
}
.brand:hover .dot {
  transform: scale(1.6);
}
nav {
  display: flex;
  gap: 1.4rem;
}
nav a {
  position: relative;
  font-size: 0.92rem;
  color: var(--muted);
  text-decoration: none;
  padding: 0.3rem 0;
  transition: color 0.15s;
}
nav a::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 1px;
  background: var(--text);
  transform: scaleX(0);
  transform-origin: left;
  transition: transform 0.3s var(--ease-out);
}
nav a:hover {
  color: var(--text);
}
nav a.router-link-active {
  color: var(--text);
}
nav a.router-link-active::after {
  transform: scaleX(1);
  height: 2px;
  background: var(--accent);
}
.theme {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--border);
  border-radius: 50%;
  background: transparent;
  color: var(--text);
  cursor: pointer;
  padding: 0;
  transition: border-color 0.15s;
}
.theme:hover {
  border-color: var(--text);
}
.theme svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: round;
}
.theme .fill {
  fill: currentColor;
  stroke: none;
}
@media (max-width: 480px) {
  .bar {
    gap: 0.9rem;
    padding-inline: 1rem;
  }
  .brand {
    font-size: 1.4rem;
  }
  nav {
    gap: 0.9rem;
  }
  nav a {
    font-size: 0.85rem;
  }
}
</style>
