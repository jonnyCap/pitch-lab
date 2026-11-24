/** Bridges runner output to the local store (Dexie) + sync outbox. */
import {
  recordTrial,
  type PitchLabDB,
  type TestResult,
  type Trial,
  type TrainingSession,
} from '@/data/db'
import { uuid } from '@/lib/random'
import type { RecordedTrial } from './runner'

export function toTrialRecord(t: RecordedTrial, sessionId: string, levelId: string): Trial {
  return {
    id: uuid(),
    sessionId,
    module: 'ap',
    levelId,
    midi: t.stimulus.midi,
    pitchClass: t.stimulus.pitchClass,
    octave: t.stimulus.octave,
    timbre: t.stimulus.timbre,
    isDistractor: t.stimulus.isDistractor,
    prevMidi: t.prevMidi,
    response: t.response,
    correct: t.correct,
    semitoneError: t.semitoneError,
    rtMs: t.rtMs,
    deadlineMs: t.deadlineMs,
    feedback: t.feedback,
    ts: Date.now(),
  }
}

export async function saveTrial(
  db: PitchLabDB,
  t: RecordedTrial,
  sessionId: string,
  levelId: string,
): Promise<void> {
  await recordTrial(db, toTrialRecord(t, sessionId, levelId))
}

export async function startSession(
  db: PitchLabDB,
  meta: Record<string, unknown>,
): Promise<TrainingSession> {
  const s: TrainingSession = {
    id: uuid(),
    module: 'ap',
    startedAt: Date.now(),
    endedAt: null,
    activeMs: 0,
    meta,
  }
  await db.transaction('rw', db.sessions, db.outbox, async () => {
    await db.sessions.add(s)
  })
  return s
}

/** Closes a session; active time is wall time capped per level so idle tabs don't inflate it. */
export async function endSession(
  db: PitchLabDB,
  s: TrainingSession,
  activeMs: number,
): Promise<void> {
  await db.transaction('rw', db.sessions, db.outbox, async () => {
    await db.sessions.update(s.id, { endedAt: Date.now(), activeMs })
    await db.outbox.add({ kind: 'session', refId: s.id, createdAt: Date.now() })
  })
}

export async function saveTestResult(
  db: PitchLabDB,
  kind: TestResult['kind'],
  metrics: Record<string, unknown>,
): Promise<TestResult> {
  const r: TestResult = { id: uuid(), kind, takenAt: Date.now(), metrics }
  await db.transaction('rw', db.testResults, db.outbox, async () => {
    await db.testResults.add(r)
    await db.outbox.add({ kind: 'test_result', refId: r.id, createdAt: Date.now() })
  })
  return r
}

/** Most recent AP training answers (no tests), newest first — input for adaptive practice. */
export async function recentTrainingTrials(db: PitchLabDB, limit = 300): Promise<Trial[]> {
  const out: Trial[] = []
  await db.trials
    .where('[module+ts]')
    .between(['ap', 0], ['ap', Infinity])
    .reverse()
    .until(() => out.length >= limit)
    .each((t) => {
      if (!t.levelId.startsWith('test-')) out.push(t)
    })
  return out
}
