<script setup lang="ts">
import { useRegisterSW } from 'virtual:pwa-register/vue'

const { needRefresh, offlineReady, updateServiceWorker } = useRegisterSW()

function close() {
  needRefresh.value = false
  offlineReady.value = false
}
</script>

<template>
  <div v-if="needRefresh || offlineReady" class="pwa card" role="alert">
    <span v-if="needRefresh">A new version of Pitch Lab is available.</span>
    <span v-else>Pitch Lab is ready to work offline.</span>
    <button v-if="needRefresh" class="btn btn-primary" @click="updateServiceWorker()">
      Reload
    </button>
    <button class="btn" @click="close">Close</button>
  </div>
</template>

<style scoped>
.pwa {
  position: fixed;
  right: 1rem;
  bottom: 1rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  z-index: 20;
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.15);
}
</style>
