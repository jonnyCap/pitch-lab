<script setup lang="ts">
/**
 * Renders notes on a treble or bass staff with VexFlow (lazy-loaded, Bravura
 * font only). Whole notes, either one after another (melodic) or stacked
 * (harmonic). Drawn in `currentColor` so it follows light/dark themes.
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { parseNote, prettyNote, type Clef } from '@/learn/notes'

const props = defineProps<{
  clef: Clef
  notes: readonly string[]
  harmonic?: boolean
  /** VexFlow key spec of a major key (e.g. 'Eb') to draw a key signature. */
  keySignature?: string
  /** Accessible description; defaults to the note names. */
  label?: string
  width?: number
}>()

const el = ref<HTMLDivElement | null>(null)
const failed = ref(false)
let disposed = false

type VF = typeof import('vexflow/bravura')
let vfPromise: Promise<VF> | null = null
async function loadVexFlow(): Promise<VF> {
  vfPromise ??= import('vexflow/bravura').then(async (m) => {
    await m.default.loadFonts('Bravura', 'Academico')
    return m
  })
  return vfPromise
}

function vexKey(name: string): { key: string; acc: string } {
  const n = parseNote(name)
  return { key: `${n.letter.toLowerCase()}${n.acc}/${n.octave}`, acc: n.acc }
}

async function draw() {
  const host = el.value
  if (!host) return
  try {
    const VF = await loadVexFlow()
    if (disposed || !el.value) return
    host.innerHTML = ''
    const { Renderer, Stave, StaveNote, Accidental, Formatter } = VF
    const width = props.width ?? 240
    const height = 170
    const renderer = new Renderer(host, Renderer.Backends.SVG)
    renderer.resize(width, height)
    const ctx = renderer.getContext()
    ctx.setFillStyle('currentColor')
    ctx.setStrokeStyle('currentColor')
    const stave = new Stave(8, 40, width - 16)
    stave.addClef(props.clef)
    if (props.keySignature) stave.addKeySignature(props.keySignature)
    stave.setContext(ctx).draw()
    if (props.notes.length === 0) {
      failed.value = false
      return
    }

    const groups = props.harmonic ? [props.notes] : props.notes.map((n) => [n])
    const staveNotes = groups.map((g) => {
      const keys = g.map(vexKey)
      const note = new StaveNote({ keys: keys.map((k) => k.key), duration: 'w', clef: props.clef })
      keys.forEach((k, i) => {
        if (k.acc) note.addModifier(new Accidental(k.acc), i)
      })
      note.setStyle({ fillStyle: 'currentColor', strokeStyle: 'currentColor' })
      return note
    })
    Formatter.FormatAndDraw(ctx, stave, staveNotes)
    failed.value = false
  } catch (e) {
    console.error('staff rendering failed', e)
    failed.value = true
  }
}

onMounted(draw)
watch(
  () => [props.clef, props.notes.join(','), props.harmonic, props.width, props.keySignature],
  draw,
)
onBeforeUnmount(() => {
  disposed = true
})
</script>

<template>
  <div
    class="staff"
    role="img"
    :aria-label="
      label ??
      (notes.length
        ? `${clef} clef: ${notes.map((n) => prettyNote(n)).join(harmonic ? ' and ' : ', ')}`
        : `${clef} clef key signature`)
    "
  >
    <div ref="el" class="svg" />
    <p v-if="failed" class="muted">{{ notes.map((n) => prettyNote(n)).join(', ') }}</p>
  </div>
</template>

<style scoped>
.staff {
  color: var(--text);
  display: flex;
  justify-content: center;
}
.svg :deep(svg) {
  display: block;
  overflow: visible;
}
</style>
