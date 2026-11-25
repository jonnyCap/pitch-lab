import { describe, expect, it } from 'vitest'
import { mulberry32 } from '@/lib/random'
import { Note } from 'tonal'
import { DECKS, correctAnswer, deckById, isCorrect } from './decks'
import {
  identifyInterval,
  INTERVALS,
  INTERVAL_ORDER,
  makeEarQuestion,
  makeSightQuestion,
} from './intervals'
import { ledgerLines, parseNote, pitchNameChroma, prettyNote, staffStep } from './notes'
import { planSession, recentAccuracy, type ReviewRecord } from './session'
import { autoGrade, newCard, Rating, review, State } from './srs'

describe('notes', () => {
  it('parses spelled notes and staff steps', () => {
    expect(parseNote('F#4')).toEqual({ name: 'F#4', letter: 'F', acc: '#', octave: 4, midi: 66 })
    expect(parseNote('Cb5').midi).toBe(71) // enharmonic of B4
    expect(staffStep('C4') + 1).toBe(staffStep('D4'))
    expect(staffStep('F#4')).toBe(staffStep('F4'))
    expect(prettyNote('Bb3')).toBe('B♭3')
    expect(pitchNameChroma('Db')).toBe(1)
  })
  it('counts ledger lines', () => {
    expect(ledgerLines('E4', 'treble')).toBe(0)
    expect(ledgerLines('D4', 'treble')).toBe(0) // space below the staff
    expect(ledgerLines('C4', 'treble')).toBe(1)
    expect(ledgerLines('A3', 'treble')).toBe(2)
    expect(ledgerLines('A5', 'treble')).toBe(1)
    expect(ledgerLines('C4', 'bass')).toBe(1)
    expect(ledgerLines('E2', 'bass')).toBe(1)
  })
})

describe('intervals', () => {
  it('catalogue matches tonal semitones; teaching order covers all', () => {
    for (const i of INTERVALS) {
      expect(Note.midi(Note.transpose('C4', i.tonal))! - 60).toBe(i.semitones)
    }
    expect([...INTERVAL_ORDER].sort()).toEqual(INTERVALS.map((i) => i.id).sort())
  })
  it('ear questions use a random root inside C3–C6', () => {
    const roots = new Set<number>()
    for (let s = 1; s <= 200; s++) {
      const q = makeEarQuestion('M6', 'desc', mulberry32(s))
      expect(q.midis[0] - q.midis[1]).toBe(9)
      expect(Math.min(...q.midis)).toBeGreaterThanOrEqual(48)
      expect(Math.max(...q.midis)).toBeLessThanOrEqual(84)
      roots.add(q.midis[1])
    }
    expect(roots.size).toBeGreaterThan(15)
  })
  it('sight questions are correctly spelled and identify back to the interval', () => {
    for (const id of INTERVAL_ORDER) {
      for (let s = 1; s <= 60; s++) {
        const q = makeSightQuestion(id, mulberry32(s * 31 + id.length))
        expect(identifyInterval(q.lower, q.upper)).toBe(id)
        expect(parseNote(q.lower).midi).toBeGreaterThanOrEqual(60)
        expect(parseNote(q.upper).midi).toBeLessThanOrEqual(84)
        for (const n of [q.lower, q.upper]) expect(['', '#', 'b']).toContain(parseNote(n).acc)
      }
    }
  })
})

describe('decks', () => {
  it('every item produces a question whose correct answer is accepted', () => {
    for (const deck of DECKS) {
      expect(new Set(deck.items).size).toBe(deck.items.length)
      for (const item of deck.items) {
        for (let s = 1; s <= 5; s++) {
          const q = deck.makeQuestion(item, {
            rng: mulberry32(s),
            introduced: deck.items.slice(0, 4),
          })
          const a = correctAnswer(q)
          expect(isCorrect(q, a), `${deck.id} ${item}`).toBe(true)
          if (q.kind === 'ear-interval' || q.kind === 'sight-interval')
            expect(q.choices).toContain(a)
          if (q.kind === 'choice') {
            expect(q.choices.map((c) => c.id)).toContain(a)
            expect(new Set(q.choices.map((c) => c.id)).size).toBe(q.choices.length)
          }
          if (q.kind === 'staff-key' || q.kind === 'name-key') {
            if (q.kind === 'staff-key') {
              expect(a).toBeGreaterThanOrEqual(q.keyboard[0])
              expect(a).toBeLessThanOrEqual(q.keyboard[1])
            }
          }
        }
      }
    }
  })
  it('keyboard deck accepts any octave and enharmonic keys; staff-keys needs the exact key', () => {
    const kb = deckById('keyboard').makeQuestion('Db', { rng: mulberry32(1), introduced: [] })
    expect(isCorrect(kb, 61)).toBe(true)
    expect(isCorrect(kb, 49)).toBe(true)
    expect(isCorrect(kb, 62)).toBe(false)
    const sk = deckById('staff-keys').makeQuestion('treble:E#4', {
      rng: mulberry32(1),
      introduced: [],
    })
    expect(isCorrect(sk, 65)).toBe(true) // E♯4 is the F4 key
    expect(isCorrect(sk, 77)).toBe(false) // wrong octave
  })
  it('interval choices grow with what has been introduced (across directions)', () => {
    const d = deckById('ear-intervals')
    const q = d.makeQuestion('desc:P5', {
      rng: mulberry32(1),
      introduced: ['asc:P5', 'asc:M3', 'asc:P8', 'desc:P5'],
    })
    expect(q.kind === 'ear-interval' && q.choices).toEqual(['M3', 'P5', 'P8'])
  })
})

describe('srs', () => {
  const now = Date.UTC(2026, 10, 25, 12)
  it('auto-grades by correctness and speed', () => {
    expect(autoGrade(false, 500, 3000)).toBe(Rating.Again)
    expect(autoGrade(true, 1000, 3000)).toBe(Rating.Easy)
    expect(autoGrade(true, 2500, 3000)).toBe(Rating.Good)
    expect(autoGrade(true, 6000, 3000)).toBe(Rating.Hard)
  })
  it('a new card goes through learning steps and then to review with growing intervals', () => {
    let c = newCard('treble', 'E4', now)
    expect(c.card.state).toBe(State.New)
    c = review(c, Rating.Good, now)
    expect(c.card.state).toBe(State.Learning)
    expect(c.card.due - now).toBeLessThanOrEqual(10 * 60 * 1000)
    c = review(c, Rating.Good, c.card.due)
    expect(c.card.state).toBe(State.Review)
    const first = c.card.due - c.card.last_review!
    c = review(c, Rating.Good, c.card.due)
    expect(c.card.due - c.card.last_review!).toBeGreaterThan(first)
    const lapsed = review(c, Rating.Again, c.card.due)
    expect(lapsed.card.state).toBe(State.Relearning)
    expect(lapsed.card.lapses).toBe(1)
  })
})

describe('planSession', () => {
  const deck = deckById('treble')
  const now = 1_000_000_000_000
  const rec = (correct: boolean, i: number): ReviewRecord => ({
    id: `${i}`,
    deck: 'treble',
    item: 'E4',
    correct,
    rtMs: 900,
    grade: 3,
    ts: now - i,
  })

  it('starts with new items in teaching order', () => {
    const p = planSession(deck, [], [], now)
    expect(p.newItems).toEqual(['E4', 'G4', 'B4', 'D5'])
    expect(p.items).toEqual(p.newItems)
  })
  it('puts most overdue reviews first and fills up with least-retained cards', () => {
    const due1 = {
      ...newCard('treble', 'G4', now),
      card: {
        ...newCard('treble', 'G4', now).card,
        due: now - 5000,
        state: State.Review,
        stability: 2,
        last_review: now - 3 * 86400000,
      },
    }
    const due2 = {
      ...newCard('treble', 'E4', now),
      card: {
        ...newCard('treble', 'E4', now).card,
        due: now - 9000,
        state: State.Review,
        stability: 2,
        last_review: now - 3 * 86400000,
      },
    }
    const later = {
      ...newCard('treble', 'B4', now),
      card: {
        ...newCard('treble', 'B4', now).card,
        due: now + 86400000,
        state: State.Review,
        stability: 5,
        last_review: now - 86400000,
      },
    }
    const p = planSession(
      deck,
      [due1, due2, later],
      Array.from({ length: 15 }, (_, i) => rec(false, i)),
      now,
    )
    expect(p.due).toBe(2)
    expect(p.newItems).toEqual([]) // accuracy 0% → no new items
    expect(p.items).toEqual(['E4', 'G4', 'B4'])
  })
  it('opens the gate for new items at ≥ 80% recent accuracy', () => {
    const reviews = Array.from({ length: 15 }, (_, i) => rec(i % 10 !== 0, i)) // 13/15 correct
    expect(recentAccuracy(reviews)).toBeCloseTo(13 / 15)
    const cards = ['E4', 'G4', 'B4'].map((i) => newCard('treble', i, now - 10))
    const p = planSession(deck, cards, reviews, now)
    expect(p.newItems).toEqual(['D5', 'F5', 'F4', 'A4'])
  })
})
