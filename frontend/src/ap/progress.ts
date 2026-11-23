/**
 * Learner progress through the ladder (persisted as state doc `ap_progress`).
 * Pure reducer so the advancement rules are unit-testable.
 */
import { NO_FEEDBACK_FAILS_BEFORE_FALLBACK, type LevelSpec } from './protocol'

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
  }
}

export type LevelTransition = 'advance' | 'repeat' | 'fallback' | 'complete'

export function applyLevelResult(
  progress: APProgress,
  ladder: readonly LevelSpec[],
  passed: boolean,
): { progress: APProgress; transition: LevelTransition } {
  const level = ladder[progress.levelIndex]
  if (!level) return { progress, transition: 'complete' }

  const next: APProgress = {
    ...progress,
    passes: { ...progress.passes },
    attempts: { ...progress.attempts, [level.id]: (progress.attempts[level.id] ?? 0) + 1 },
  }

  if (passed) {
    next.passes[level.id] = (next.passes[level.id] ?? 0) + 1
    next.failStreak = 0
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
        (l) => l.tier === level.tier && l.step === level.step - 1 && l.feedback,
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

/** Number of pitch classes learned to criterion: tiers whose final step was passed. */
export function pitchesMastered(progress: APProgress, ladder: readonly LevelSpec[]): number {
  let mastered = 0
  for (const l of ladder) {
    if (l.step === 8 && (progress.passes[l.id] ?? 0) > 0) mastered = l.tier
  }
  return mastered
}
