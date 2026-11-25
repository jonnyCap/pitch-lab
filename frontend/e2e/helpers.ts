import { expect, type Page } from '@playwright/test'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=']

/** What to answer: a pitch class or "none" (not in my set). `target` is -1 for distractors. */
export type Answerer = (target: number) => number | 'none'

/** The correct answer for every trial. */
export const correct: Answerer = (t) => (t < 0 ? 'none' : t)

/** Answers every trial of the running level via the keyboard until it finishes. */
export async function playLevel(page: Page, answer: Answerer): Promise<number> {
  const run = page.locator('section.run')
  await expect(run).toBeVisible()
  let answered = 0
  for (;;) {
    // Wait until the next trial is listening or the level has ended.
    const state = await page.waitForFunction(() => {
      const el = document.querySelector('section.run') as HTMLElement | null
      if (!el) return 'done'
      return el.dataset.phase === 'listening' && el.dataset.e2eTarget ? el.dataset.e2eTarget : null
    })
    const value = (await state.jsonValue()) as string
    if (value === 'done') break
    const index = await run.getAttribute('data-index')
    const a = answer(value === 'none' ? -1 : Number(value))
    await page.keyboard.press(a === 'none' ? 'n' : KEYS[a]!)
    answered++
    // Wait until this trial is over: the next one started, or the level ended.
    await page.waitForFunction((i) => {
      const el = document.querySelector('section.run') as HTMLElement | null
      return !el || el.dataset.index !== i || el.dataset.phase !== 'listening'
    }, index)
  }
  return answered
}

export interface SeedState {
  progress?: Record<string, unknown>
  tests?: { id: string; kind: string; takenAt: number; metrics: Record<string, unknown> }[]
  sessions?: {
    id: string
    module: string
    startedAt: number
    endedAt: number
    activeMs: number
    meta: object
  }[]
}

/** Opens the app, waits for Dexie to create the DB, writes state, reloads. */
export async function seed(page: Page, state: SeedState, path = '/trainer'): Promise<void> {
  await page.goto(path)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await page.waitForFunction(async () =>
    (await indexedDB.databases()).some((d) => d.name === 'pitchlab'),
  )
  await page.evaluate(async (s) => {
    const open = indexedDB.open('pitchlab')
    const db: IDBDatabase = await new Promise((res) => (open.onsuccess = () => res(open.result)))
    const tx = db.transaction(['stateDocs', 'testResults', 'sessions'], 'readwrite')
    if (s.progress) {
      tx.objectStore('stateDocs').put({
        key: 'ap_progress',
        version: 1,
        updatedAt: Date.now(),
        dirty: 1,
        doc: s.progress,
      })
    }
    for (const t of s.tests ?? []) tx.objectStore('testResults').put(t)
    for (const x of s.sessions ?? []) tx.objectStore('sessions').put(x)
    await new Promise((res) => (tx.oncomplete = res))
    db.close()
  }, state)
  await page.reload()
}

export function progress(over: Record<string, unknown>): Record<string, unknown> {
  return {
    schema: 1,
    levelIndex: 0,
    failStreak: 0,
    passes: {},
    attempts: {},
    onboardingDone: true,
    bestIndex: 0,
    finalPasses: [],
    masteredAt: null,
    passesSinceDrill: 0,
    drillDue: false,
    points: 0,
    ...over,
  }
}

export const pretest = (takenAt = Date.now()) => ({
  id: 'seed-pretest',
  kind: 'pretest',
  takenAt,
  metrics: { accuracy: 0.1, mad: 2.8, band: 'non-ap', untrained: { accuracy: 0.08 } },
})

/** Answers questions until the session summary appears. `wrongFirst` answers the first question wrongly. */
export async function practise(page: Page, opts: { wrongFirst?: boolean } = {}) {
  let answered = 0
  for (;;) {
    const state = await page.waitForFunction(() => {
      if (document.querySelector('.summary')) return 'done'
      const el = document.querySelector('section.practice') as HTMLElement | null
      return el?.dataset.stage === 'question' && el.dataset.e2eAnswer
        ? `${el.dataset.kind}|${el.dataset.e2eAnswer}`
        : null
    })
    const value = (await state.jsonValue()) as string
    if (value === 'done') break
    const [kind, answer] = value.split('|') as [string, string]
    const index = await page.locator('section.practice').getAttribute('data-index')
    const wrong = opts.wrongFirst && answered === 0
    if (kind === 'name-key' || kind === 'staff-key') {
      const midi = wrong ? Number(answer) + 1 : Number(answer)
      await page.locator(`.keyboard [data-midi="${midi}"]`).dispatchEvent('pointerdown')
    } else {
      const choices = page.locator('[data-choice]')
      const target = wrong
        ? choices
            .filter({ hasNot: page.locator(`[data-choice="${answer}"]`) })
            .and(page.locator(`:not([data-choice="${answer}"])`))
            .first()
        : page.locator(`[data-choice="${answer}"]`)
      await target.dispatchEvent('pointerdown')
    }
    answered++
    if (wrong) {
      await expect(page.getByText('✗ Not quite')).toBeVisible()
      await page.getByRole('button', { name: /Continue/ }).click()
    } else {
      await page.waitForFunction((i) => {
        const el = document.querySelector('section.practice') as HTMLElement | null
        return !el || el.dataset.index !== i || el.dataset.stage !== 'question'
      }, index)
    }
  }
  return answered
}
