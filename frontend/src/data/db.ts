/**
 * Local-first IndexedDB store (Dexie). Training never waits on the network:
 * every record is written here first and mirrored to the API by data/sync.ts
 * via the outbox table.
 */
import Dexie, { type EntityTable } from 'dexie'
import type { PitchClass } from '@/music/pitch'

export type TrialResponse = PitchClass | 'none' | 'timeout'

/** One response in any perceptual task. Append-only. Mirrors backend table `trials`. */
export interface Trial {
  id: string // client UUID (idempotent upload key)
  sessionId: string
  module: 'ap' | 'intervals' | 'harmony' | 'notes' | 'rhythm'
  levelId: string
  midi: number
  pitchClass: PitchClass
  octave: number
  timbre: string
  isDistractor: boolean
  prevMidi: number | null
  response: TrialResponse
  correct: boolean
  semitoneError: number | null
  rtMs: number | null
  deadlineMs: number | null
  feedback: boolean
  ts: number // epoch ms
}

export interface TrainingSession {
  id: string
  module: Trial['module']
  startedAt: number
  endedAt: number | null
  activeMs: number
  meta: Record<string, unknown>
}

/** Versioned JSON document (ap_progress, srs, settings, ...). Mirrors `state_docs`. */
export interface StateDoc<T = unknown> {
  key: string
  version: number
  doc: T
  updatedAt: number
  dirty: 0 | 1 // 1 = local change not yet pushed (number so it can be indexed)
}

export interface TestResult {
  id: string
  kind: 'pretest' | 'weekly' | 'retention_1m' | 'retention_3m' | 'posttest'
  takenAt: number
  metrics: Record<string, unknown>
}

export type OutboxKind = 'trial' | 'session' | 'test_result'

export interface OutboxItem {
  seq?: number // auto-increment
  kind: OutboxKind
  refId: string
  createdAt: number
}

export type PitchLabDB = Dexie & {
  trials: EntityTable<Trial, 'id'>
  sessions: EntityTable<TrainingSession, 'id'>
  stateDocs: EntityTable<StateDoc, 'key'>
  testResults: EntityTable<TestResult, 'id'>
  outbox: EntityTable<OutboxItem, 'seq'>
}

export function createDB(name = 'pitchlab'): PitchLabDB {
  const db = new Dexie(name) as PitchLabDB
  db.version(1).stores({
    trials: 'id, sessionId, levelId, ts, [module+ts]',
    sessions: 'id, module, startedAt',
    stateDocs: 'key, dirty',
    testResults: 'id, kind, takenAt',
    outbox: '++seq, kind',
  })
  return db
}

export const db = createDB()

/** Records a trial and enqueues it for upload in one transaction. */
export async function recordTrial(database: PitchLabDB, trial: Trial): Promise<void> {
  await database.transaction('rw', database.trials, database.outbox, async () => {
    await database.trials.add(trial)
    await database.outbox.add({ kind: 'trial', refId: trial.id, createdAt: Date.now() })
  })
}

/** Writes a state document locally, bumping its version and marking it dirty. */
export async function putStateDoc<T>(
  database: PitchLabDB,
  key: string,
  doc: T,
): Promise<StateDoc<T>> {
  return database.transaction('rw', database.stateDocs, async () => {
    const prev = await database.stateDocs.get(key)
    const next: StateDoc<T> = {
      key,
      version: (prev?.version ?? 0) + 1,
      doc,
      updatedAt: Date.now(),
      dirty: 1,
    }
    await database.stateDocs.put(next)
    return next
  })
}

export async function getStateDoc<T>(database: PitchLabDB, key: string): Promise<T | undefined> {
  return (await database.stateDocs.get(key))?.doc as T | undefined
}
