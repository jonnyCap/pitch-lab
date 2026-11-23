import { expect, test, type Page } from '@playwright/test'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=']

/** Answers every trial of the running level via the keyboard until it finishes. */
async function playLevel(page: Page, answer: (target: number) => number) {
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
    await page.keyboard.press(KEYS[answer(Number(value))]!)
    answered++
    // Wait until this trial is over: the next one started, or the level ended.
    await page.waitForFunction((i) => {
      const el = document.querySelector('section.run') as HTMLElement | null
      return !el || el.dataset.index !== i || el.dataset.phase !== 'listening'
    }, index)
  }
  return answered
}

test('onboarding → pretest → pass the first training step → progress', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

  await page.goto('/trainer')
  await page.getByRole('button', { name: 'Sounds good' }).click()
  await page.getByRole('button', { name: 'Got it' }).click()
  await page.getByRole('button', { name: 'Continue to the test' }).click()

  // Pretest: 96 notes, answer everything one semitone sharp → 0% exact, 100% within one.
  await expect(page).toHaveURL(/\/test\/pretest$/)
  await page.getByRole('button', { name: 'Start' }).click()
  const pretestAnswers = await playLevel(page, (t) => (t + 1) % 12)
  expect(pretestAnswers).toBe(96)
  await expect(page.getByRole('heading', { name: 'Your result' })).toBeVisible()
  await expect(page.getByText('exactly right (chance ≈ 8%)')).toBeVisible()
  await expect(page.locator('.stats .value').first()).toHaveText('0%')
  await expect(page.locator('.stats .value').nth(1)).toHaveText('100%')

  // First training step (E, F, F♯; feedback): answer correctly → pass.
  await page.getByRole('link', { name: 'Go to training' }).click()
  await expect(page.getByRole('heading', { name: '3 pitches · step 1 of 8' })).toBeVisible()
  await page.getByRole('button', { name: 'Start' }).click()
  expect(await playLevel(page, (t) => t)).toBe(12)
  await expect(page.locator('.summary h2')).toContainText('100%')
  await expect(page.getByText('Passed — on to the next step.')).toBeVisible()
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('heading', { name: '3 pitches · step 2 of 8' })).toBeVisible()
  await expect(page.getByText(/15-second sliding tone/)).toBeVisible()

  // Progress persists across reloads (IndexedDB).
  await page.goto('/progress')
  await expect(page.locator('.stat .value').nth(3)).toHaveText('1') // levels passed
  await expect(page.getByRole('cell', { name: 'pretest' })).toBeVisible()
  await page.reload()
  await expect(page.locator('.stat .value').nth(3)).toHaveText('1')

  const counts = await page.evaluate(async () => {
    const open = indexedDB.open('pitchlab')
    const db: IDBDatabase = await new Promise((res, rej) => {
      open.onsuccess = () => res(open.result)
      open.onerror = () => rej(open.error)
    })
    const count = (store: string) =>
      new Promise<number>((res) => {
        const r = db.transaction(store).objectStore(store).count()
        r.onsuccess = () => res(r.result)
      })
    return {
      trials: await count('trials'),
      outbox: await count('outbox'),
      tests: await count('testResults'),
    }
  })
  expect(counts.trials).toBe(96 + 12)
  expect(counts.tests).toBe(1)
  expect(counts.outbox).toBeGreaterThanOrEqual(96 + 12 + 1)
  expect(errors).toEqual([])
})

test('a no-feedback step falls back after three failures', async ({ page }) => {
  await page.goto('/trainer')
  // Wait until the app has opened (and created) the Dexie database.
  await expect(page.getByRole('heading', { name: 'Set up your sound' })).toBeVisible()
  // Seed state: onboarding done, pretest taken, at t3-s2.
  await page.evaluate(async () => {
    const open = indexedDB.open('pitchlab')
    const db: IDBDatabase = await new Promise((res) => (open.onsuccess = () => res(open.result)))
    const tx = db.transaction(['stateDocs', 'testResults'], 'readwrite')
    tx.objectStore('stateDocs').put({
      key: 'ap_progress',
      version: 1,
      updatedAt: Date.now(),
      dirty: 1,
      doc: {
        schema: 1,
        levelIndex: 1,
        failStreak: 0,
        passes: { 't3-s1': 1 },
        attempts: {},
        onboardingDone: true,
        bestIndex: 1,
      },
    })
    tx.objectStore('testResults').put({
      id: 'seed',
      kind: 'pretest',
      takenAt: Date.now(),
      metrics: {},
    })
    await new Promise((res) => (tx.oncomplete = res))
  })
  await page.reload()

  for (let i = 0; i < 3; i++) {
    await expect(page.getByRole('heading', { name: '3 pitches · step 2 of 8' })).toBeVisible()
    await page.getByRole('button', { name: 'Start' }).click()
    await playLevel(page, (t) => (t === 4 ? 5 : 4)) // always wrong
    await expect(page.locator('.summary h2')).toContainText('0%')
    await page.getByRole('button', { name: 'Continue' }).click()
  }
  await expect(page.getByRole('heading', { name: '3 pitches · step 1 of 8' })).toBeVisible()
})
