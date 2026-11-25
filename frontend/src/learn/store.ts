/** Persistence for fundamentals practice (Dexie + sync outbox). */
import { getStateDoc, putStateDoc, type PitchLabDB } from '@/data/db'
import { normalizeRhythmProgress, type RhythmProgress } from './rhythm'
import { uuid } from '@/lib/random'
import type { ReviewRecord } from './session'
import type { StoredCard } from './srs'

export async function loadCards(db: PitchLabDB, deck: string): Promise<StoredCard[]> {
  return db.srsCards.where('deck').equals(deck).toArray()
}

export async function recentReviews(
  db: PitchLabDB,
  deck: string,
  limit = 50,
): Promise<ReviewRecord[]> {
  return db.reviews
    .where('[deck+ts]')
    .between([deck, 0], [deck, Infinity])
    .reverse()
    .limit(limit)
    .toArray()
}

/** Saves the updated card and the review in one transaction and queues both for sync. */
export async function saveReview(
  db: PitchLabDB,
  card: StoredCard,
  r: Omit<ReviewRecord, 'id'>,
): Promise<ReviewRecord> {
  const record: ReviewRecord = { id: uuid(), ...r }
  await db.transaction('rw', db.srsCards, db.reviews, db.outbox, async () => {
    await db.srsCards.put(card)
    await db.reviews.add(record)
    const now = Date.now()
    await db.outbox.bulkAdd([
      { kind: 'review', refId: record.id, createdAt: now },
      { kind: 'srs_card', refId: card.id, createdAt: now },
    ])
  })
  return record
}

export interface DeckStats {
  introduced: number
  total: number
  due: number
}

export async function deckStats(
  db: PitchLabDB,
  deck: string,
  total: number,
  now: number,
): Promise<DeckStats> {
  const cards = await loadCards(db, deck)
  return { introduced: cards.length, total, due: cards.filter((c) => c.card.due <= now).length }
}

const RHYTHM_KEY = 'rhythm_progress'

export async function loadRhythmProgress(db: PitchLabDB): Promise<RhythmProgress> {
  return normalizeRhythmProgress(await getStateDoc<Partial<RhythmProgress>>(db, RHYTHM_KEY))
}

export async function saveRhythmProgress(db: PitchLabDB, p: RhythmProgress): Promise<void> {
  // Plain copy: IndexedDB cannot clone Vue's reactive proxies.
  await putStateDoc(db, RHYTHM_KEY, JSON.parse(JSON.stringify(p)) as RhythmProgress)
}

/** Logs a tap-along attempt in the review log (deck 'rhythm-tap'). */
export async function logRhythmAttempt(
  db: PitchLabDB,
  level: number,
  score: number,
  meanAbsErrorMs: number | null,
  passed: boolean,
): Promise<void> {
  const record: ReviewRecord = {
    id: uuid(),
    deck: 'rhythm-tap',
    item: `L${level}`,
    correct: passed,
    rtMs: Math.round(meanAbsErrorMs ?? 0),
    grade: Math.round(score * 100),
    ts: Date.now(),
  }
  await db.transaction('rw', db.reviews, db.outbox, async () => {
    await db.reviews.add(record)
    await db.outbox.add({ kind: 'review', refId: record.id, createdAt: Date.now() })
  })
}
