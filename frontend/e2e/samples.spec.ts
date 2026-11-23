import { expect, test } from '@playwright/test'

/**
 * Verifies the generated instrument samples end to end in a real browser:
 * every playable MIDI note of every sample timbre is rendered exactly as the
 * engine plays it (nearest sample + playbackRate incl. detune correction) and
 * its pitch must be within ±5 cents of equal temperament. Also checks that the
 * encoded files start promptly (no long encoder padding that would bias RTs).
 */
const VIBRATO = new Set(['violin'])

for (const ext of ['ogg', 'm4a'] as const) {
  test(`sample tuning and onset (${ext})`, async ({ page }) => {
    await page.goto('/')
    const report = await page.evaluate(async (ext) => {
      const { SAMPLE_TIMBRES } = await import('/src/audio/sampleSets.ts')
      const { nearestSample } = await import('/src/audio/instruments.ts')
      const { medianPitchMidi } = await import('/src/audio/analysis.ts')
      const SR = 44100
      const ctx = new OfflineAudioContext(1, SR, SR)
      const out: { timbre: string; midi: number; cents: number | null }[] = []
      const onsets: { timbre: string; note: number; onsetMs: number }[] = []
      if (SAMPLE_TIMBRES.length === 0) return { out, onsets, timbres: 0 }

      for (const t of SAMPLE_TIMBRES) {
        if (t.source.kind !== 'samples') continue
        const src = t.source
        const buffers = new Map<number, AudioBuffer>()
        for (const n of src.notes) {
          const res = await fetch(`${src.baseUrl}/${n}.${ext}`)
          const buf = await ctx.decodeAudioData(await res.arrayBuffer())
          buffers.set(n, buf)
          const d = buf.getChannelData(0)
          let peak = 0
          for (const s of d) peak = Math.max(peak, Math.abs(s))
          let i = 0
          while (i < d.length && Math.abs(d[i]!) < peak * 0.03) i++
          onsets.push({ timbre: t.id, note: n, onsetMs: (i / buf.sampleRate) * 1000 })
        }
        // Training/test range used by the app: octaves 3–6 (MIDI 48–95) within the timbre range.
        const lo = Math.max(48, t.range[0])
        const hi = Math.min(95, t.range[1])
        for (let midi = lo; midi <= hi; midi++) {
          const { sampleMidi, playbackRate } = nearestSample(src.notes, midi, src.detuneCents)
          const off = new OfflineAudioContext(1, Math.round(0.9 * SR), SR)
          const node = off.createBufferSource()
          node.buffer = buffers.get(sampleMidi)!
          node.playbackRate.value = playbackRate
          node.connect(off.destination)
          node.start()
          const rendered = (await off.startRendering()).getChannelData(0)
          // Same measurement as the pipeline: median pitch over the sustained part.
          const m = medianPitchMidi(rendered, SR, {
            startSec: 0.15,
            endSec: 0.85,
            window: midi < 55 ? 8192 : 4096,
            hop: 2048,
          })
          const cents = m === null ? null : (m - midi) * 100
          out.push({ timbre: t.id, midi, cents })
        }
      }
      return { out, onsets, timbres: SAMPLE_TIMBRES.length }
    }, ext)

    test.skip(report.timbres === 0, 'no sample sets generated')
    // Steady instruments: ±5 cents. Vibrato (violin) swings ~±15 cents around its
    // centre, so its measured centre is allowed ±10 cents (still 10× below a semitone).
    const tolerance = (timbre: string) => (VIBRATO.has(timbre) ? 10 : 5)
    const bad = report.out.filter(
      (r) => r.cents === null || Math.abs(r.cents) > tolerance(r.timbre),
    )
    const worst = Math.max(...report.out.map((r) => Math.abs(r.cents ?? 99)))
    for (const timbre of new Set(report.out.map((r) => r.timbre))) {
      const w = Math.max(
        ...report.out.filter((r) => r.timbre === timbre).map((r) => Math.abs(r.cents ?? 99)),
      )
      console.log(`${ext} ${timbre}: worst ${w.toFixed(1)} cents`)
    }
    console.log(`${ext}: ${report.out.length} notes checked, worst ${worst.toFixed(1)} cents`)
    expect(bad, JSON.stringify(bad)).toEqual([])
    const late = report.onsets.filter((o) => o.onsetMs > 15)
    console.log(
      `${ext}: max onset ${Math.max(...report.onsets.map((o) => o.onsetMs)).toFixed(1)} ms`,
    )
    expect(late, JSON.stringify(late)).toEqual([])
  })
}
