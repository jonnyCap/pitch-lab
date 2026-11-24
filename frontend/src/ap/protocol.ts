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
 * 10 tiers × 8 steps = 80 pitch levels, followed by 3 speed tiers (Wong et al. 2025:
 * fast AND accurate judgments) that tighten the response window 3.5 → 2.5 → 2.0 s
 * with all 12 pitches, 3 instruments and 3 octaves. The very last level is the
 * mastery level: it must be passed 4 times, the 4th at least 12 h after the 3rd.
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
/** Share of out-of-set "distractor" tones once the set has ≥ 4 pitches (answer: "not in my set"). */
export const DISTRACTOR_RATE = 0.15
/** Feedback steps: chance that a trial is a 3-point ⭐ special trial (cf. Wong et al. 2020). */
export const SPECIAL_TRIAL_RATE = 1 / 30
export const SPEED_DEADLINES_MS = [3500, 2500, 2000] as const
export const MASTERY_PASSES = 4
export const MASTERY_GAP_MS = 12 * 60 * 60 * 1000
/** Every N passed levels (set ≥ 5 pitches) a compulsory drill on the weakest pitch. */
export const DRILL_EVERY_PASSES = 10
export const DRILL_MIN_SET = 5
export const DRILL_TRIALS = 20

export type LevelKind = 'train' | 'test' | 'drill'
export type LevelStage = 'pitch' | 'speed' | 'test' | 'drill'

export interface LevelSpec {
  id: string
  kind: LevelKind
  stage: LevelStage
  /** Human-readable title, e.g. "5 pitches · step 3". */
  title: string
  tier: number
  step: number
  /** Number of steps in this tier (8 for pitch tiers, 2 for speed tiers). */
  stepsInTier: number
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
  /** Share of trials drawn from outside the pitch set; correct answer is "none". */
  distractorRate: number
  /** Offer the "not in my set" answer. */
  allowNone: boolean
  /** Feedback steps adapt sampling to the learner's confusions. */
  adaptive: boolean
  /** Chance per trial of a 3-point special trial. */
  specialRate: number
  /** The mastery level (last of the ladder). */
  final: boolean
  /** Drills only: the pitch to practise and its confusion partners. */
  focus?: DrillFocus
}

export interface DrillFocus {
  pitch: PitchClass
  partners: PitchClass[]
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
    // Out-of-set tones force a real judgement ("is this one of mine?") instead of
    // choosing the nearest of a few options; impossible once all 12 are in the set.
    const distractorRate = tier > MIN_SET && tier < MAX_SET ? DISTRACTOR_RATE : 0
    STEP_SHAPES.forEach((shape, i) => {
      const step = i + 1
      levels.push({
        id: levelId(tier, step),
        kind: 'train',
        stage: 'pitch',
        title: `${tier} pitches · step ${step} of ${STEPS_PER_TIER}`,
        tier,
        step,
        stepsInTier: STEPS_PER_TIER,
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
        distractorRate,
        allowNone: distractorRate > 0,
        adaptive: shape.feedback,
        specialRate: shape.feedback ? SPECIAL_TRIAL_RATE : 0,
        final: false,
      })
    })
  }

  // Speed tiers: full difficulty, shrinking response window.
  const all = [...cfg.pitchOrder].sort((a, b) => a - b) as PitchClass[]
  SPEED_DEADLINES_MS.forEach((deadlineMs, i) => {
    const tier = i + 1
    for (const feedback of [true, false]) {
      const step = feedback ? 1 : 2
      levels.push({
        id: `sp${tier}-s${step}`,
        kind: 'train',
        stage: 'speed',
        title: `Speed ${tier} · answer within ${(deadlineMs / 1000).toFixed(1)} s · step ${step} of 2`,
        tier,
        step,
        stepsInTier: 2,
        pitchSet: all,
        responseOptions: all,
        timbres: cfg.trainedTimbres.slice(0, 3),
        octaves: [4, 5, 6],
        feedback,
        deadlineMs,
        trials: trialsForSetSize(MAX_SET),
        interference: feedback ? null : 'shepard',
        betweenTrials: feedback ? 'silence' : 'noise',
        minLeap: feedback ? 0 : 7,
        passAccuracy: PASS_ACCURACY,
        distractorRate: 0,
        allowNone: false,
        adaptive: feedback,
        specialRate: feedback ? SPECIAL_TRIAL_RATE : 0,
        final: false,
      })
    }
  })
  levels[levels.length - 1]!.final = true
  return levels
}

/**
 * Compulsory drill on the weakest pitch (cf. Wong et al. 2020, Exp. 3): 20
 * feedback trials, half on the focus pitch and half on the pitches it is most
 * often confused with, in the configuration of the level just played.
 */
export function buildDrillSpec(
  base: LevelSpec,
  focus: PitchClass,
  partners: readonly PitchClass[],
): LevelSpec {
  return {
    ...base,
    id: `drill-${focus}`,
    kind: 'drill',
    stage: 'drill',
    title: 'Focus drill',
    feedback: true,
    trials: DRILL_TRIALS,
    interference: null,
    betweenTrials: 'silence',
    minLeap: 0,
    distractorRate: 0,
    allowNone: false,
    adaptive: false,
    specialRate: 0,
    final: false,
    responseOptions: base.pitchSet,
    focus: { pitch: focus, partners: [...partners] },
  }
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
    stage: 'test',
    title: 'Absolute pitch test',
    tier: 12,
    step: 0,
    stepsInTier: 1,
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
    distractorRate: 0,
    allowNone: false,
    adaptive: false,
    specialRate: 0,
    final: false,
  }
}
