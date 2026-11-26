<!-- Hairline inline icons for the journey screens (currentColor, no icon library). -->
<script setup lang="ts">
export type JIconName =
  | 'headphones'
  | 'play'
  | 'clock'
  | 'eye-off'
  | 'target'
  | 'notes'
  | 'flame'
  | 'trophy'
  | 'lock'
  | 'check'
  | 'ear'
  | 'refresh'
withDefaults(defineProps<{ name: JIconName; size?: number }>(), { size: 22 })
</script>

<template>
  <svg
    class="jicon"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.4"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <template v-if="name === 'headphones'">
      <path d="M4 15v-3a8 8 0 0 1 16 0v3" />
      <rect x="3.5" y="14" width="4" height="6.5" rx="1.2" />
      <rect x="16.5" y="14" width="4" height="6.5" rx="1.2" />
    </template>
    <path v-else-if="name === 'play'" d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none" />
    <template v-else-if="name === 'clock'">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5l3.2 2" />
    </template>
    <template v-else-if="name === 'eye-off'">
      <path d="M3 12s3.5-6.5 9-6.5c1.6 0 3 .5 4.2 1.3M21 12s-3.5 6.5-9 6.5c-1.6 0-3-.5-4.2-1.3" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M4 4l16 16" />
    </template>
    <template v-else-if="name === 'target'">
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </template>
    <template v-else-if="name === 'notes'">
      <path d="M9 17.5V6l10-2v11.5" />
      <circle cx="6.5" cy="17.5" r="2.5" />
      <circle cx="16.5" cy="15.5" r="2.5" />
    </template>
    <path
      v-else-if="name === 'flame'"
      d="M12 3c.5 3.5 5 5.5 5 10.5a5 5 0 0 1-10 0c0-2 1-3.2 2-4.2.2 1.2.8 2 1.6 2.4C10.3 9 10.8 6 12 3z"
    />
    <template v-else-if="name === 'trophy'">
      <path
        d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5v1.5A3 3 0 0 0 8 10.5M16 6h3v1.5a3 3 0 0 1-3 3M12 13v4M8.5 20h7M10 17h4"
      />
    </template>
    <template v-else-if="name === 'lock'">
      <rect x="5.5" y="11" width="13" height="9" rx="1.5" />
      <path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" />
    </template>
    <path v-else-if="name === 'check'" d="M5 12.5l4.5 4.5L19 7.5" />
    <template v-else-if="name === 'ear'">
      <path d="M7 10a5 5 0 0 1 10 0c0 3-3 3.5-3 6.5a2.5 2.5 0 0 1-5 0" />
      <path d="M10.5 10a1.5 1.5 0 0 1 3 0" />
    </template>
    <template v-else-if="name === 'refresh'">
      <path d="M19.5 12a7.5 7.5 0 1 1-2.4-5.5M19.5 4.5v4h-4" />
    </template>
  </svg>
</template>

<style scoped>
.jicon {
  flex: none;
}
</style>
