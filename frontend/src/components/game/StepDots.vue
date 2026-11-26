<!--
  Dots stepper. <StepDots :count="3" v-model="step" />
  The active dot stretches into a pill; every dot is a button.
-->
<script setup lang="ts">
defineProps<{ count: number; modelValue: number }>()
const emit = defineEmits<{ 'update:modelValue': [value: number] }>()
</script>

<template>
  <div class="dots" role="group" aria-label="Steps">
    <button
      v-for="i in count"
      :key="`dot-${i}`"
      type="button"
      class="dot"
      :class="{ on: i - 1 === modelValue, past: i - 1 < modelValue }"
      :aria-label="`Step ${i} of ${count}`"
      :aria-current="i - 1 === modelValue ? 'step' : undefined"
      @click="emit('update:modelValue', i - 1)"
    />
  </div>
</template>

<style scoped>
.dots {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.dot {
  position: relative;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
}
.dot::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 7px;
  height: 7px;
  translate: -50% -50%;
  border-radius: 4px;
  background: var(--border, #dcdcd8);
  transition:
    width 0.3s var(--ease-spring, ease),
    background 0.2s var(--ease-out, ease);
}
.dot.past::before {
  background: var(--text, #0b0b0c);
}
.dot.on::before {
  width: 20px;
  background: var(--accent, #1e40ff);
}
.dot:focus-visible {
  outline: 2px solid var(--accent, #1e40ff);
  outline-offset: -2px;
  border-radius: 4px;
}
</style>
