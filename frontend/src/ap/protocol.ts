/**
 * Declarative absolute-pitch training ladder.
 *
 * Structure follows Wong, Lui, Yip & Wong (2020): the pitch set grows from 3 to
 * 12 pitch classes, one per tier; each tier runs 8 steps that progressively add
 * octaves and timbres, and every configuration is played first WITH feedback and
 * then WITHOUT feedback. A step is passed at ≥90% exact pitch-class accuracy
 * (semitone errors count as wrong). Extended with the three-octave range of
 * Wong et al. (2025) so learners must rely on pitch chroma, not pitch height.
 *
 * 10 tiers × 8 steps = 80 levels.
 */
import type { PitchClass } from '@/music/pitch'
import type { TimbreId } from '@/audio/instruments'

/**
 * Order in which pitch classes join the set: seed E, F, F♯ (Wong et al.), then
 * alternating chromatic neighbours above/below so adjacent-semitone contrasts —
 * the hardest discriminations — are trained from the start.
 */
export const DEFAULT_PITCH_ORDER: readonly PitchClass[] = [4, 5, 6, 7, 3, 8, 2, 9, 1, 10, 0, 11]

export const MIN_SET = 3
export const MAX_SET = 12
export const STEPS_PER_TIER = 8
export const PASS_ACCURACY = 0.9
export const DEFAULT_DEADLINE_MS = 5000
/** Failing a no-feedback step this many times in a row sends you back to its feedback step. */
export const NO_FEEDBACK_FAILS_BEFORE_FALLBACK = 3
export const SHEPARD_SEC = 15

export interface LevelSpec {
  id: string
  kind: 'train' | 'test'
  /** Human-readable title, e.g. "5 pitches · step 3". */
  title: string
  tier: number
  step: number
  pitchSet: PitchClass[]
  /** Pitch classes offered on the response wheel. */
  responseOptions: PitchClass[]
  timbres: TimbreId[]
  octaves: number[]
  feedback: boolean
  deadlineMs: number
  trials: number
  /** Played once before the first trial. */
  interference: 'shepard' | null
  /** What fills the inter-trial interval. */
  betweenTrials: 'silence' | 'noise'
  /** Minimum |Δmidi| between consecutive stimuli (0 = unconstrained). */
  minLeap: number
  passAccuracy: number
}

export interface ProtocolConfig {
  pitchOrder: readonly PitchClass[]
  /** Up to three trained timbres; the first one is used for single-timbre steps. */
  trainedTimbres: readonly TimbreId[]
  deadlineMs: number
}

interface StepShape {
  multiTimbre: boolean
  octaves: number[]
  feedback: boolean
  description: string
}

const STEP_SHAPES: readonly StepShape[] = [
  { multiTimbre: false, octaves: [4], feedback: true, description: '1 instrument, 1 octave' },
  { multiTimbre: false, octaves: [4], feedback: false, description: '1 instrument, 1 octave' },
  { multiTimbre: false, octaves: [4, 5], feedback: true, description: '1 instrument, 2 octaves' },
  { multiTimbre: false, octaves: [4, 5], feedback: false, description: '1 instrument, 2 octaves' },
  { multiTimbre: true, octaves: [4], feedback: true, description: '3 instruments, 1 octave' },
  { multiTimbre: true, octaves: [4], feedback: false, description: '3 instruments, 1 octave' },
  {
    multiTimbre: true,
    octaves: [4, 5, 6],
    feedback: true,
    description: '3 instruments, 3 octaves',
  },
  {
    multiTimbre: true,
    octaves: [4, 5, 6],
    feedback: false,
    description: '3 instruments, 3 octaves',
  },
]

/** Trials per level: 12 at 3 pitches, +2 per added pitch, capped at 30 (Wong et al. 2020, Exp. 3). */
export function trialsForSetSize(size: number): number {
  return Math.min(30, 12 + 2 * (size - MIN_SET))
}

export function levelId(tier: number, step: number): string {
  return `t${tier}-s${step}`
}

export function stepDescription(step: number): string {
  return STEP_SHAPES[step - 1]!.description
}

export function buildLadder(cfg: ProtocolConfig): LevelSpec[] {
  if (cfg.trainedTimbres.length === 0) throw new Error('at least one trained timbre required')
  const levels: LevelSpec[] = []
  for (let tier = MIN_SET; tier <= MAX_SET; tier++) {
    const pitchSet = [...cfg.pitchOrder.slice(0, tier)].sort((a, b) => a - b) as PitchClass[]
    STEP_SHAPES.forEach((shape, i) => {
      const step = i + 1
      levels.push({
        id: levelId(tier, step),
        kind: 'train',
        title: `${tier} pitches · step ${step} of ${STEPS_PER_TIER}`,
        tier,
        step,
        pitchSet,
        responseOptions: pitchSet,
        timbres: shape.multiTimbre
          ? cfg.trainedTimbres.slice(0, 3)
          : cfg.trainedTimbres.slice(0, 1),
        octaves: shape.octaves,
        feedback: shape.feedback,
        deadlineMs: cfg.deadlineMs,
        trials: trialsForSetSize(tier),
        interference: shape.feedback ? null : 'shepard',
        betweenTrials: shape.feedback ? 'silence' : 'noise',
        // No-feedback steps spanning several octaves avoid small steps between
        // consecutive tones (≥ a fifth), removing easy relative-pitch cues.
        // Tests use > 1 octave (buildTestSpec); in training that is often infeasible.
        minLeap: !shape.feedback && shape.octaves.length >= 2 ? 7 : 0,
        passAccuracy: PASS_ACCURACY,
      })
    })
  }
  return levels
}

/**
 * Absolute-pitch test (pretest / weekly / retention): all 12 pitch classes,
 * octaves 3–6 (3 and 6 partly untrained), a trained and an untrained timbre,
 * no feedback, consecutive tones > 1 octave apart, 5 s response window.
 */
export function buildTestSpec(opts: {
  trainedTimbre: TimbreId
  untrainedTimbre: TimbreId
  kind?: string
}): LevelSpec {
  const all = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as PitchClass[]
  return {
    id: `test-${opts.kind ?? 'pretest'}`,
    kind: 'test',
    title: 'Absolute pitch test',
    tier: 12,
    step: 0,
    pitchSet: all,
    responseOptions: all,
    timbres: [opts.trainedTimbre, opts.untrainedTimbre],
    octaves: [3, 4, 5, 6],
    feedback: false,
    deadlineMs: DEFAULT_DEADLINE_MS,
    trials: 12 * 4 * 2,
    interference: 'shepard',
    betweenTrials: 'silence',
    minLeap: 13,
    passAccuracy: PASS_ACCURACY,
  }
}
