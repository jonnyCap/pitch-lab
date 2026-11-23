<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
import { Toaster } from 'vue-sonner'
import ReloadPrompt from '@/components/ReloadPrompt.vue'
</script>

<template>
  <header class="topbar">
    <RouterLink to="/" class="brand">
      <img src="/favicon.svg" alt="" width="28" height="28" />
      <span>Pitch Lab</span>
    </RouterLink>
    <nav>
      <RouterLink to="/trainer">Trainer</RouterLink>
      <RouterLink to="/learn">Learn</RouterLink>
      <RouterLink to="/progress">Progress</RouterLink>
    </nav>
  </header>
  <main class="container">
    <RouterView />
  </main>
  <ReloadPrompt />
  <Toaster rich-colors position="bottom-center" />
</template>

<style scoped>
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
  position: sticky;
  top: 0;
  z-index: 10;
}
.brand {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 700;
  color: var(--text);
  text-decoration: none;
}
nav {
  display: flex;
  gap: 1rem;
}
nav a {
  color: var(--muted);
  text-decoration: none;
  font-weight: 500;
}
nav a.router-link-active {
  color: var(--accent);
}
</style>
