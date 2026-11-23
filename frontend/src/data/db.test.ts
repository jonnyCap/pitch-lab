import { afterEach, describe, expect, it } from 'vitest'
import { createDB, getStateDoc, putStateDoc, recordTrial, type Trial } from './db'

const dbs: ReturnType<typeof createDB>[] = []
function freshDB() {
  const d = createDB(`test-${Math.random()}`)
  dbs.push(d)
  return d
}
afterEach(async () => {
  for (const d of dbs.splice(0)) await d.delete()
})

const trial = (id: string): Trial => ({
  id,
  sessionId: 's1',
  module: 'ap',
  levelId: 't3-s1',
  midi: 64,
  pitchClass: 4,
  octave: 4,
  timbre: 'complex',
  isDistractor: false,
  prevMidi: null,
  response: 4,
  correct: true,
  semitoneError: 0,
  rtMs: 812,
  deadlineMs: 5000,
  feedback: true,
  ts: Date.now(),
})

describe('db', () => {
  it('records trials and enqueues them atomically', async () => {
    const d = freshDB()
    await recordTrial(d, trial('a'))
    await recordTrial(d, trial('b'))
    expect(await d.trials.count()).toBe(2)
    const out = await d.outbox.toArray()
    expect(out.map((o) => o.refId)).toEqual(['a', 'b'])
  })

  it('rolls back the outbox entry when the trial insert fails', async () => {
    const d = freshDB()
    await recordTrial(d, trial('a'))
    await expect(recordTrial(d, trial('a'))).rejects.toThrow()
    expect(await d.outbox.count()).toBe(1)
  })

  it('versions state docs and marks them dirty', async () => {
    const d = freshDB()
    const v1 = await putStateDoc(d, 'ap_progress', { tier: 3 })
    const v2 = await putStateDoc(d, 'ap_progress', { tier: 4 })
    expect(v1.version).toBe(1)
    expect(v2.version).toBe(2)
    expect(v2.dirty).toBe(1)
    expect(await getStateDoc(d, 'ap_progress')).toEqual({ tier: 4 })
    expect(await d.stateDocs.where('dirty').equals(1).count()).toBe(1)
  })
})
