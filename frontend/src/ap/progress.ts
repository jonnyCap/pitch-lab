/**
 * Learner progress through the ladder (persisted as state doc `ap_progress`).
 * Pure reducer so the advancement rules are unit-testable.
 */
import {
  DRILL_EVERY_PASSES,
  DRILL_MIN_SET,
  MASTERY_GAP_MS,
  MASTERY_PASSES,
  NO_FEEDBACK_FAILS_BEFORE_FALLBACK,
  type LevelSpec,
} from './protocol'

export interface APProgress {
  schema: 1
  /** Index into the ladder of the level to play next. */
  levelIndex: number
  /** Consecutive failures of the current no-feedback level. */
  failStreak: number
  /** levelId → number of passes. */
  passes: Record<string, number>
  /** levelId → number of attempts. */
  attempts: Record<string, number>
  onboardingDone: boolean
  /** Index of the furthest level ever reached (for display). */
  bestIndex: number
  /** Timestamps of passes of the final mastery level. */
  finalPasses: number[]
  /** When all mastery passes were completed. */
  masteredAt: number | null
  /** Passed levels since the last focus drill. */
  passesSinceDrill: number
  /** A focus drill must be completed before the next level. */
  drillDue: boolean
  /** Total points collected. */
  points: number
}

export function initialProgress(): APProgress {
  return {
    schema: 1,
    levelIndex: 0,
    failStreak: 0,
    passes: {},
    attempts: {},
    onboardingDone: false,
    bestIndex: 0,
    finalPasses: [],
    masteredAt: null,
    passesSinceDrill: 0,
    drillDue: false,
    points: 0,
  }
}

/** Fills fields added after a document was saved (older app versions). */
export function normalizeProgress(saved: Partial<APProgress> | undefined): APProgress {
  if (!saved || saved.schema !== 1) return initialProgress()
  return { ...initialProgress(), ...saved }
}

export type LevelTransition = 'advance' | 'repeat' | 'fallback' | 'mastery-pass' | 'complete'

export interface LevelResultInput {
  passed: boolean
  points: number
  now: number
}

export function applyLevelResult(
  progress: APProgress,
  ladder: readonly LevelSpec[],
  { passed, points, now }: LevelResultInput,
): { progress: APProgress; transition: LevelTransition } {
  const level = ladder[progress.levelIndex]
  if (!level) return { progress, transition: 'complete' }

  const next: APProgress = {
    ...progress,
    passes: { ...progress.passes },
    attempts: { ...progress.attempts, [level.id]: (progress.attempts[level.id] ?? 0) + 1 },
    finalPasses: [...progress.finalPasses],
    points: progress.points + points,
  }

  if (passed) {
    next.passes[level.id] = (next.passes[level.id] ?? 0) + 1
    next.failStreak = 0
    next.passesSinceDrill = progress.passesSinceDrill + 1
    if (next.passesSinceDrill >= DRILL_EVERY_PASSES && level.pitchSet.length >= DRILL_MIN_SET) {
      next.drillDue = true
      next.passesSinceDrill = 0
    }

    if (level.final) {
      next.finalPasses.push(now)
      if (next.finalPasses.length < MASTERY_PASSES) {
        return { progress: next, transition: 'mastery-pass' }
      }
      next.masteredAt = now
    }

    next.levelIndex = progress.levelIndex + 1
    next.bestIndex = Math.max(progress.bestIndex, next.levelIndex)
    return {
      progress: next,
      transition: next.levelIndex >= ladder.length ? 'complete' : 'advance',
    }
  }

  if (!level.feedback) {
    next.failStreak = progress.failStreak + 1
    if (next.failStreak >= NO_FEEDBACK_FAILS_BEFORE_FALLBACK) {
      const fb = ladder.findIndex(
        (l) =>
          l.stage === level.stage &&
          l.tier === level.tier &&
          l.step === level.step - 1 &&
          l.feedback,
      )
      if (fb >= 0) {
        next.levelIndex = fb
        next.failStreak = 0
        return { progress: next, transition: 'fallback' }
      }
    }
    return { progress: next, transition: 'repeat' }
  }

  next.failStreak = 0
  return { progress: next, transition: 'repeat' }
}

/**
 * Whether the current level may be started now. The last mastery pass must come
 * at least 12 h after the previous one (Wong et al. 2025), so a pass cannot be
 * carried by short-term memory of the session.
 */
export function canStart(
  progress: APProgress,
  level: LevelSpec,
  now: number,
): { ok: true } | { ok: false; until: number } {
  if (level.final && progress.finalPasses.length === MASTERY_PASSES - 1) {
    const until = progress.finalPasses[MASTERY_PASSES - 2]! + MASTERY_GAP_MS
    if (now < until) return { ok: false, until }
  }
  return { ok: true }
}

export function completeDrill(progress: APProgress, points: number): APProgress {
  return { ...progress, drillDue: false, points: progress.points + points }
}

/** Number of pitch classes learned to criterion: tiers whose final step was passed. */
export function pitchesMastered(progress: APProgress, ladder: readonly LevelSpec[]): number {
  let mastered = 0
  for (const l of ladder) {
    if (l.stage === 'pitch' && l.step === l.stepsInTier && (progress.passes[l.id] ?? 0) > 0) {
      mastered = l.tier
    }
  }
  return mastered
}
