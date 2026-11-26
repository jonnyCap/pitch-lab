/**
 * Motion helpers shared by the game & tour kit.
 *
 *   import { dur, sleep, prefersReducedMotion } from '@/lib/motion'
 *   el.animate(frames, { duration: dur(300) })   // 0 when reduced motion, <=20 in E2E
 *   await sleep(650)                              // same scaling
 */

/** True when the app runs in the Playwright e2e build mode. */
export const E2E: boolean = import.meta.env.MODE === 'e2e'

/** True when the user asked the OS/browser for reduced motion. */
export function prefersReducedMotion(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    )
  } catch {
    return false
  }
}

/** Scale a duration: `0` when reduced motion, `min(ms, 20)` in E2E, else `ms`. */
export function dur(ms: number): number {
  if (prefersReducedMotion()) return 0
  if (E2E) return Math.min(ms, 20)
  return ms
}

/** Resolve after `dur(ms)` milliseconds. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, dur(ms)))
}
