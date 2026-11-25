<script setup lang="ts">
/** Renders text with **bold** segments — without v-html. */
import { computed } from 'vue'

const props = defineProps<{ text: string }>()
const parts = computed(() =>
  props.text
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map((p) =>
      p.startsWith('**') && p.endsWith('**')
        ? { bold: true, t: p.slice(2, -2) }
        : { bold: false, t: p },
    ),
)
</script>

<template>
  <span
    ><template v-for="(p, i) in parts" :key="i"
      ><strong v-if="p.bold">{{ p.t }}</strong
      ><template v-else>{{ p.t }}</template></template
    ></span
  >
</template>
