/**
 * Builds a practice session for a deck: due reviews first (most overdue
 * first), new items interleaved — but only while recent accuracy is high —
 * and, if little is due, extra practice on the items closest to being
 * forgotten. Items still in short-term learning are re-asked within the session.
 */
import type { DeckDef } from './decks'
import { retrievability, type StoredCard } from './srs'

export interface ReviewRecord {
  id: string
  deck: string
  item: string
  correct: boolean
  rtMs: number
  grade: number
  ts: number
}

export const SESSION_SIZE = 20
export const GATE_WINDOW = 15
export const GATE_ACCURACY = 0.8
/** Re-ask a card in the same session when it is due again within this time. */
export const REQUEUE_WITHIN_MS = 10 * 60 * 1000

export function recentAccuracy(
  reviews: readonly ReviewRecord[],
  window = GATE_WINDOW,
): number | null {
  const last = [...reviews].sort((a, b) => b.ts - a.ts).slice(0, window)
  if (last.length < Math.min(8, window)) return null
  return last.filter((r) => r.correct).length / last.length
}

export interface SessionPlan {
  items: string[]
  newItems: string[]
  due: number
}

export function planSession(
  deck: DeckDef,
  cards: readonly StoredCard[],
  reviews: readonly ReviewRecord[],
  now: number,
  size = SESSION_SIZE,
): SessionPlan {
  const known = new Map(cards.map((c) => [c.item, c]))
  const due = cards.filter((c) => c.card.due <= now).sort((a, b) => a.card.due - b.card.due)

  const unseen = deck.items.filter((i) => !known.has(i))
  const acc = recentAccuracy(reviews)
  const gateOpen = acc === null || acc >= GATE_ACCURACY
  const mustIntroduce = Math.max(0, deck.minIntroduced - known.size)
  const nNew = Math.min(unseen.length, Math.max(mustIntroduce, gateOpen ? deck.newPerSession : 0))
  const newItems = unseen.slice(0, nNew)

  const reviewItems = due.map((c) => c.item).slice(0, Math.max(0, size - newItems.length))
  // Fill up with the least-retained items if little is due.
  if (reviewItems.length + newItems.length < size) {
    const ahead = cards
      .filter((c) => c.card.due > now)
      .sort((a, b) => retrievability(a, now) - retrievability(b, now))
      .map((c) => c.item)
    for (const item of ahead) {
      if (reviewItems.length + newItems.length >= size) break
      reviewItems.push(item)
    }
  }

  // Interleave: spread new items evenly through the reviews.
  const items: string[] = []
  const gap = newItems.length
    ? Math.max(1, Math.floor(reviewItems.length / newItems.length))
    : Infinity
  let r = 0
  for (let n = 0; n < newItems.length; n++) {
    items.push(newItems[n]!)
    for (let k = 0; k < gap && r < reviewItems.length; k++) items.push(reviewItems[r++]!)
  }
  while (r < reviewItems.length) items.push(reviewItems[r++]!)
  // New items appear again right after introduction (learning), so show them early.
  return { items, newItems, due: due.length }
}

/** Where to re-insert a card that is due again soon (a few questions later). */
export function requeuePosition(currentIndex: number, queueLength: number): number {
  return Math.min(queueLength, currentIndex + 4)
}
