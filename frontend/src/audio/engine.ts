/**
 * AudioEngine: owns the AudioContext, caches rendered/decoded buffers, and
 * schedules stimuli with sample-accurate timing. Every played tone returns the
 * performance.now() timestamp of its audible onset for response-time measurement.
 */
import { getTimbre, nearestSample, type TimbreId } from './instruments'
import { pinkNoise, shepardGlissando, toAudioBuffer } from './interference'
import { renderTone } from './synth'
import { contextTimeToPerfMs } from './timing'

/** Scheduling lead so the first sample is never late (and onset time is exact). */
const LEAD_SEC = 0.06
const TONE_SEC = 1
const SAMPLE_FADE_SEC = 0.1

export interface PlayedSound {
  /** AudioContext time at which the sound starts. */
  contextStart: number
  /** performance.now()-clock ms of the audible onset. */
  onsetPerfMs: number
  /** Resolves when playback has finished. */
  ended: Promise<void>
  stop: () => void
}

export class AudioEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private buffers = new Map<string, Promise<AudioBuffer>>()
  private volume = 0.8

  /** Must be called from a user gesture the first time (autoplay policy). */
  async unlock(): Promise<AudioContext> {
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: 'interactive' })
      this.master = this.ctx.createGain()
      this.master.gain.value = this.volume
      this.master.connect(this.ctx.destination)
    }
    if (this.ctx.state !== 'running') await this.ctx.resume()
    return this.ctx
  }

  get isRunning(): boolean {
    return this.ctx?.state === 'running'
  }

  setVolume(v: number): void {
    this.volume = Math.min(1, Math.max(0, v))
    if (this.ctx && this.master)
      this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.02)
  }

  /** Preloads the buffers for the given notes so trials start without jitter. */
  async preload(timbre: TimbreId, midis: Iterable<number>): Promise<void> {
    const ctx = await this.unlock()
    await Promise.all([...midis].map((m) => this.toneBuffer(ctx, timbre, m)))
  }

  async playTone(timbre: TimbreId, midi: number): Promise<PlayedSound> {
    const ctx = await this.unlock()
    const def = getTimbre(timbre)
    const buffer = await this.toneBuffer(ctx, timbre, midi)
    const src = ctx.createBufferSource()
    src.buffer = buffer
    let out: AudioNode = src

    if (def.source.kind === 'samples') {
      src.playbackRate.value = nearestSample(def.source.notes, midi).playbackRate
      // Trim recorded notes to the stimulus length with a short fade-out.
      const g = ctx.createGain()
      src.connect(g)
      out = g
      const t0 = ctx.currentTime + LEAD_SEC
      g.gain.setValueAtTime(1, t0 + TONE_SEC - SAMPLE_FADE_SEC)
      g.gain.linearRampToValueAtTime(0, t0 + TONE_SEC)
      return this.start(ctx, src, out, t0, TONE_SEC)
    }
    return this.start(ctx, src, out, ctx.currentTime + LEAD_SEC)
  }

  /** Descending Shepard glissando used before no-feedback and test blocks. */
  async playShepard(durationSec = 15): Promise<PlayedSound> {
    const ctx = await this.unlock()
    const key = `shepard:${durationSec}:${ctx.sampleRate}`
    const buf = await this.cached(key, async () =>
      toAudioBuffer(ctx, shepardGlissando({ sampleRate: ctx.sampleRate, durationSec })),
    )
    const src = ctx.createBufferSource()
    src.buffer = buf
    return this.start(ctx, src, src, ctx.currentTime + LEAD_SEC)
  }

  /** Short noise burst used between trials in no-feedback blocks. */
  async playNoise(durationSec = 1): Promise<PlayedSound> {
    const ctx = await this.unlock()
    const src = ctx.createBufferSource()
    src.buffer = toAudioBuffer(ctx, pinkNoise(ctx.sampleRate, durationSec))
    return this.start(ctx, src, src, ctx.currentTime + LEAD_SEC)
  }

  private start(
    ctx: AudioContext,
    src: AudioBufferSourceNode,
    out: AudioNode,
    when: number,
    duration?: number,
  ): PlayedSound {
    out.connect(this.master!)
    const ended = new Promise<void>((resolve) => {
      src.onended = () => {
        out.disconnect()
        resolve()
      }
    })
    if (duration !== undefined) src.start(when, 0, duration)
    else src.start(when)
    return {
      contextStart: when,
      onsetPerfMs: contextTimeToPerfMs(ctx, when),
      ended,
      stop: () => {
        try {
          src.stop()
        } catch {
          /* already stopped */
        }
      },
    }
  }

  private toneBuffer(ctx: AudioContext, timbre: TimbreId, midi: number): Promise<AudioBuffer> {
    const def = getTimbre(timbre)
    const src = def.source
    if (src.kind === 'synth') {
      return this.cached(`synth:${src.waveform}:${midi}:${ctx.sampleRate}`, async () =>
        toAudioBuffer(
          ctx,
          renderTone({ sampleRate: ctx.sampleRate, midi, waveform: src.waveform }),
        ),
      )
    }
    const { sampleMidi } = nearestSample(src.notes, midi)
    return this.cached(`sample:${def.id}:${sampleMidi}`, async () => {
      const ext = supportsOgg() ? 'ogg' : 'm4a'
      const res = await fetch(`${src.baseUrl}/${sampleMidi}.${ext}`)
      if (!res.ok) throw new Error(`failed to load sample ${def.id}/${sampleMidi}: ${res.status}`)
      return ctx.decodeAudioData(await res.arrayBuffer())
    })
  }

  private cached(key: string, make: () => Promise<AudioBuffer>): Promise<AudioBuffer> {
    let p = this.buffers.get(key)
    if (!p) {
      p = make()
      p.catch(() => this.buffers.delete(key))
      this.buffers.set(key, p)
    }
    return p
  }
}

let oggSupport: boolean | null = null
function supportsOgg(): boolean {
  if (oggSupport === null) {
    oggSupport =
      typeof Audio !== 'undefined' && new Audio().canPlayType('audio/ogg; codecs="vorbis"') !== ''
  }
  return oggSupport
}

/** App-wide singleton. */
export const audio = new AudioEngine()
