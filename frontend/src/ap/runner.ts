/**
 * LevelRunner plays one level (training step or test):
 *
 *   [Shepard interference] → for each stimulus:
 *       tone → response window (deadline from audible onset)
 *       → [feedback: correct pitch highlighted + tone replayed]
 *       → inter-trial interval (1.5–2.5 s jitter, noise-filled in no-feedback steps)
 *   → summary
 *
 * Audio, clock and persistence are injected, so the whole flow runs under fake
 * timers in tests. UI observes progress through `onState` snapshots.
 */
import type { PitchClass } from '@/music/pitch'
import type { PlayedSound } from '@/audio/engine'
import type { TimbreId } from '@/audio/instruments'
import type { TrialResponse } from '@/data/db'
import type { Rng } from '@/lib/random'
import { SHEPARD_SEC, type LevelSpec } from './protocol'
import { scoreResponse, summarizeLevel, type LevelSummary, type TrialOutcome } from './scoring'
import type { Stimulus } from './sequencer'

export interface RunnerAudio {
  playTone(timbre: TimbreId, midi: number): Promise<PlayedSound>
  playShepard(durationSec: number): Promise<PlayedSound>
  playNoise(durationSec: number): Promise<PlayedSound>
}

export interface RunnerClock {
  /** performance.now()-compatible clock (same base as Event.timeStamp). */
  now(): number
  sleep(ms: number): Promise<void>
}

export const realClock: RunnerClock = {
  now: () => performance.now(),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
}

export type RunnerPhase =
  'ready' | 'interference' | 'listening' | 'feedback' | 'pause' | 'done' | 'aborted'

export interface RunnerFeedback {
  target: PitchClass
  response: TrialResponse
  correct: boolean
}

export interface RunnerState {
  phase: RunnerPhase
  /** 0-based index of the current trial. */
  index: number
  total: number
  /** Set during 'feedback' (only shown in feedback steps). */
  feedback: RunnerFeedback | null
  /** performance.now() at which the interference ends (for a countdown). */
  interferenceEndsAt: number | null
}

export interface RecordedTrial extends TrialOutcome {
  stimulus: Stimulus
  prevMidi: number | null
  deadlineMs: number
  feedback: boolean
}

export interface RunnerDeps {
  audio: RunnerAudio
  clock?: RunnerClock
  rng: Rng
  onState?: (s: RunnerState) => void
  onTrial?: (t: RecordedTrial) => void | Promise<void>
  /** Feedback display time (ms). */
  feedbackMs?: number
  itiMinMs?: number
  itiMaxMs?: number
  shepardSec?: number
}

export interface RunResult {
  outcomes: RecordedTrial[]
  summary: LevelSummary
}

class Aborted extends Error {}

export class LevelRunner {
  private state: RunnerState
  private readonly clock: RunnerClock
  private aborted = false
  private sounds = new Set<PlayedSound>()
  private pendingResponse: ((r: { response: PitchClass; at: number }) => void) | null = null

  constructor(
    private readonly spec: LevelSpec,
    private readonly sequence: readonly Stimulus[],
    private readonly deps: RunnerDeps,
  ) {
    this.clock = deps.clock ?? realClock
    this.state = {
      phase: 'ready',
      index: 0,
      total: sequence.length,
      feedback: null,
      interferenceEndsAt: null,
    }
  }

  get snapshot(): RunnerState {
    return { ...this.state }
  }

  /** Accepts an answer during the response window. Returns false if ignored. */
  respond(response: PitchClass, eventTimeStamp: number = this.clock.now()): boolean {
    if (this.state.phase !== 'listening' || !this.pendingResponse) return false
    if (!this.spec.responseOptions.includes(response)) return false
    const resolve = this.pendingResponse
    this.pendingResponse = null
    resolve({ response, at: eventTimeStamp })
    return true
  }

  abort(): void {
    if (this.aborted) return
    this.aborted = true
    for (const s of this.sounds) s.stop()
    this.sounds.clear()
    this.pendingResponse = null
    this.set({ phase: 'aborted' })
  }

  async run(): Promise<RunResult | null> {
    const outcomes: RecordedTrial[] = []
    try {
      if (this.spec.interference === 'shepard') {
        const sec = this.deps.shepardSec ?? SHEPARD_SEC
        this.set({ phase: 'interference', interferenceEndsAt: this.clock.now() + sec * 1000 })
        await this.play(this.deps.audio.playShepard(sec), true)
        this.set({ interferenceEndsAt: null })
      }

      let prev: Stimulus | null = null
      for (let i = 0; i < this.sequence.length; i++) {
        const stim = this.sequence[i]!
        const trial = await this.runTrial(stim, prev, i)
        outcomes.push(trial)
        await this.deps.onTrial?.(trial)
        this.check()

        if (this.spec.feedback) {
          this.set({
            phase: 'feedback',
            feedback: { target: stim.pitchClass, response: trial.response, correct: trial.correct },
          })
          await this.play(this.deps.audio.playTone(stim.timbre, stim.midi), false)
          await this.sleep(this.deps.feedbackMs ?? 1400)
        }

        if (i < this.sequence.length - 1) {
          this.set({ phase: 'pause', feedback: null })
          const iti = this.iti()
          if (this.spec.betweenTrials === 'noise') {
            // Noise fills the first second of the gap; the next tone waits for it to end.
            await this.play(this.deps.audio.playNoise(1), true)
            await this.sleep(Math.max(0, iti - 1000))
          } else {
            await this.sleep(iti)
          }
        }
        prev = stim
      }

      this.set({ phase: 'done', feedback: null })
      return { outcomes, summary: summarizeLevel(outcomes, this.spec.passAccuracy) }
    } catch (e) {
      if (e instanceof Aborted) return null
      throw e
    }
  }

  private async runTrial(
    stim: Stimulus,
    prev: Stimulus | null,
    index: number,
  ): Promise<RecordedTrial> {
    this.set({ phase: 'listening', index, feedback: null })
    const responded = new Promise<{ response: PitchClass; at: number }>((resolve) => {
      this.pendingResponse = resolve
    })
    const sound = await this.play(this.deps.audio.playTone(stim.timbre, stim.midi), false)
    const onset = sound.onsetPerfMs
    const deadline = this.spec.deadlineMs
    const timeout = this.clock
      .sleep(Math.max(0, onset + deadline - this.clock.now()))
      .then(() => null)

    const r = await Promise.race([responded, timeout])
    this.pendingResponse = null
    this.check()

    const response: TrialResponse = r ? r.response : 'timeout'
    const rtMs = r ? Math.max(0, Math.round(r.at - onset)) : null
    const scored = scoreResponse(stim.pitchClass, response, rtMs, deadline)
    return {
      stimulus: stim,
      target: stim.pitchClass,
      response,
      rtMs,
      timbre: stim.timbre,
      octave: stim.octave,
      prevMidi: prev?.midi ?? null,
      deadlineMs: deadline,
      feedback: this.spec.feedback,
      ...scored,
    }
  }

  private iti(): number {
    const min = this.deps.itiMinMs ?? 1500
    const max = this.deps.itiMaxMs ?? 2500
    return min + this.deps.rng() * (max - min)
  }

  private async play(p: Promise<PlayedSound>, waitForEnd: boolean): Promise<PlayedSound> {
    const sound = await p
    this.sounds.add(sound)
    void sound.ended.then(() => this.sounds.delete(sound))
    this.check(sound)
    if (waitForEnd) {
      await sound.ended
      this.check()
    }
    return sound
  }

  private async sleep(ms: number): Promise<void> {
    await this.clock.sleep(ms)
    this.check()
  }

  private check(sound?: PlayedSound): void {
    if (this.aborted) {
      sound?.stop()
      throw new Aborted()
    }
  }

  private set(patch: Partial<RunnerState>): void {
    if (this.aborted && patch.phase !== 'aborted') return
    this.state = { ...this.state, ...patch }
    this.deps.onState?.(this.snapshot)
  }
}
