/** Persistence for fundamentals practice (Dexie + sync outbox). */
import type { PitchLabDB } from '@/data/db'
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
