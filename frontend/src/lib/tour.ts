/**
 * Coach-tour state. Seen tours are remembered in localStorage (`pitchlab-tours`);
 * every storage access is guarded so private mode / blocked storage never throws.
 *
 *   if (toursEnabled() && !hasSeenTour('trainer')) …   // CoachTour does this itself
 */
import { E2E } from './motion'

export interface TourStep {
  /** CSS selector of the element to spotlight; prefer `[data-tour="…"]`. Omit for a centered card. */
  target?: string
  title: string
  body: string
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'auto'
}

const KEY = 'pitchlab-tours'

function read(): Record<string, true> {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, true>)
      : {}
  } catch {
    return {}
  }
}

export function hasSeenTour(id: string): boolean {
  return read()[id] === true
}

export function markTourSeen(id: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...read(), [id]: true }))
  } catch {
    /* storage unavailable: the tour may show again, which is acceptable */
  }
}

export function resetTours(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

/** Tours never auto-start in E2E mode. */
export function toursEnabled(): boolean {
  return !E2E
}
