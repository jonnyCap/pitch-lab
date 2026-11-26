import { expect, test } from '@playwright/test'
import { playLevel, progress, pretest, seed } from './helpers'

test('onboarding → pretest → pass the first training step → progress', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

  await page.goto('/trainer')
  await page.getByRole('button', { name: 'Sounds good' }).click()
  await page.getByRole('button', { name: 'Got it' }).click()
  await page.getByRole('button', { name: 'Start the baseline test' }).click()

  // Pretest: 96 notes, answer everything one semitone sharp → 0% exact, 100% within one.
  await expect(page).toHaveURL(/\/test\/pretest$/)
  await page.getByRole('button', { name: 'Start' }).click()
  const pretestAnswers = await playLevel(page, (t) => (t + 1) % 12)
  expect(pretestAnswers).toBe(96)
  await expect(page.getByRole('heading', { name: 'Your result' })).toBeVisible()
  await expect(page.getByText('exactly right (chance ≈ 8%)')).toBeVisible()
  // Values count up; `data-final` holds the final text.
  await expect(page.locator('.stats .value').first()).toHaveAttribute('data-final', '0%')
  await expect(page.locator('.stats .value').nth(1)).toHaveAttribute('data-final', '100%')

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
  // 12 correct answers in step 1 = 12 points, +2 for each random ⭐ trial.
  const pointsText = page.getByText(/streak · \d+ points/)
  await expect(pointsText).toBeVisible()
  const points = Number((await pointsText.textContent())!.match(/(\d+) points/)![1])
  expect(points).toBeGreaterThanOrEqual(12)
  expect((points - 12) % 2).toBe(0)
  await expect(page.getByText('pitches in training · step 2/8')).toBeVisible()
  await expect(page.getByRole('cell', { name: 'Baseline test' })).toBeVisible()
  // Every answer one semitone sharp: 0% exact but mean error 1.0 → "Emerging".
  await expect(page.getByText('Emerging').first()).toBeVisible()
  await page.reload()
  await expect(page.getByText(`streak · ${points} points`)).toBeVisible()

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
  await seed(page, {
    progress: progress({ levelIndex: 1, passes: { 't3-s1': 1 }, bestIndex: 1 }),
    tests: [pretest()],
  })

  for (let i = 0; i < 3; i++) {
    await expect(page.getByRole('heading', { name: '3 pitches · step 2 of 8' })).toBeVisible()
    await page.getByRole('button', { name: 'Start' }).click()
    await playLevel(page, (t) => (t === 4 ? 5 : 4)) // always wrong
    await expect(page.locator('.summary h2')).toContainText('0%')
    await page.getByRole('button', { name: 'Continue' }).click()
  }
  await expect(page.getByRole('heading', { name: '3 pitches · step 1 of 8' })).toBeVisible()
})
