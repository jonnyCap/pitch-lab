import { expect, test, type Page } from '@playwright/test'
import { practise } from './helpers'

async function dbCounts(page: Page) {
  return page.evaluate(async () => {
    const open = indexedDB.open('pitchlab')
    const db: IDBDatabase = await new Promise((res) => (open.onsuccess = () => res(open.result)))
    const count = (store: string) =>
      new Promise<number>((res) => {
        const r = db.transaction(store).objectStore(store).count()
        r.onsuccess = () => res(r.result)
      })
    const out = { cards: await count('srsCards'), reviews: await count('reviews') }
    db.close()
    return out
  })
}

test('lesson renders notation and links to practice', async ({ page }) => {
  await page.goto('/learn/lesson/treble-clef')
  await expect(page.getByRole('heading', { name: 'The treble clef' })).toBeVisible()
  await expect(page.locator('.staff svg').first()).toBeVisible()
  expect(await page.locator('.staff svg').count()).toBeGreaterThanOrEqual(3)
  // VexFlow drew note heads / clefs (SVG text glyphs or paths).
  expect(await page.locator('.staff svg *').count()).toBeGreaterThan(20)
  await page.getByRole('link', { name: 'Practise now' }).click()
  await expect(page).toHaveURL(/\/learn\/practice\/treble$/)
})

test('treble clef practice: new items are introduced and saved with FSRS', async ({ page }) => {
  await page.goto('/learn/practice/treble')
  const answered = await practise(page)
  // Instant correct answers grade as Easy → straight to review, nothing re-asked.
  expect(answered).toBe(4)
  await expect(page.locator('.summary h2')).toContainText('100%')
  await expect(page.getByText('New today: 4 items.')).toBeVisible()
  expect(await dbCounts(page)).toEqual({ cards: 4, reviews: answered })

  await page.goto('/learn')
  await expect(page.locator('[data-deck="treble"]')).toContainText('4/17 learned')
})

test('a wrong answer shows the solution, waits for Continue, and is asked again', async ({
  page,
}) => {
  await page.goto('/learn/practice/bass')
  const answered = await practise(page, { wrongFirst: true })
  // Again → due in 1 minute → re-asked within the session.
  expect(answered).toBe(5)
  await expect(page.locator('.summary h2')).toContainText('80%')
})

test('keyboard and staff → keyboard decks accept key presses', async ({ page }) => {
  await page.goto('/learn/practice/keyboard')
  await practise(page)
  await expect(page.locator('.summary h2')).toContainText('100%')
  await page.goto('/learn/practice/staff-keys')
  await practise(page)
  await expect(page.locator('.summary h2')).toContainText('100%')
})

test('intervals by ear and on the staff', async ({ page }) => {
  await page.goto('/learn/practice/ear-intervals')
  await expect(page.getByText('Which interval?')).toBeVisible()
  // First session: P5, M3, P8 rising.
  await expect(page.locator('[data-choice]')).toHaveCount(3)
  await practise(page)
  await expect(page.locator('.summary h2')).toContainText('100%')
  await page.goto('/learn/practice/sight-intervals')
  await practise(page)
  await expect(page.locator('.summary h2')).toContainText('100%')
})

test('learn hub lists modules, lessons and decks', async ({ page }) => {
  await page.goto('/learn')
  await expect(page.getByRole('heading', { name: 'Notes & staff' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Intervals', exact: true })).toBeVisible()
  await expect(page.locator('[data-deck]')).toHaveCount(14)
  await expect(page.getByRole('link', { name: /Hearing intervals/ })).toBeVisible()
})
