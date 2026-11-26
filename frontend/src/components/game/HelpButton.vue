<!--
  Small round "?" button that replays a tour.
  Usage: <HelpButton @click="tour?.start()" />  (a CoachTour ref exposes start()).
-->
<script setup lang="ts">
defineProps<{ label?: string }>()
const emit = defineEmits<{ click: [event: MouseEvent] }>()
</script>

<template>
  <button
    type="button"
    class="help-btn"
    :aria-label="label ?? 'Show tour'"
    :title="label ?? 'Show tour'"
    @click="emit('click', $event)"
  >
    <span aria-hidden="true">?</span>
  </button>
</template>

<style scoped>
.help-btn {
  display: inline-grid;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid var(--border, #dcdcd8);
  border-radius: 50%;
  background: var(--surface, #fff);
  color: var(--muted, #5f6168);
  font: italic 400 1.05rem/1 var(--serif, Georgia, serif);
  cursor: pointer;
  transition:
    color 0.18s var(--ease-out, ease),
    border-color 0.18s var(--ease-out, ease),
    transform 0.12s var(--ease-out, ease);
}
.help-btn:hover {
  color: var(--accent-ink, #1e40ff);
  border-color: var(--accent, #1e40ff);
}
.help-btn:active {
  transform: scale(0.94);
}
.help-btn:focus-visible {
  outline: 2px solid var(--accent, #1e40ff);
  outline-offset: 2px;
}
</style>
