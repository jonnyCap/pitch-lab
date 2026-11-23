<script setup lang="ts">
defineProps<{ title: string; milestone: string }>()
</script>

<template>
  <section class="card">
    <h1>{{ title }}</h1>
    <p class="muted">This module is planned for milestone {{ milestone }}.</p>
  </section>
</template>
