import { expect, test } from '@playwright/test'
import { correct, playLevel, pretest, progress, seed } from './helpers'

const H = 60 * 60 * 1000
const DAY = 24 * H

test('distractors: "not in my set" answers pass a 4-pitch step', async ({ page }) => {
  await seed(page, { progress: progress({ levelIndex: 8, bestIndex: 8 }), tests: [pretest()] })
  await expect(page.getByRole('heading', { name: '4 pitches · step 1 of 8' })).toBeVisible()
  await expect(page.getByText(/not in your set/)).toBeVisible()
  await page.getByRole('button', { name: 'Start' }).click()
  await expect(page.getByRole('button', { name: /Not in my set/ })).toBeVisible()
  await playLevel(page, correct)
  await expect(page.locator('.summary h2')).toContainText('100%')
  await expect(page.locator('.summary .distractors')).toContainText('Not in set')
  await expect(page.getByText(/\+\d+ points/)).toBeVisible()
})

test('focus drill runs after 10 passes, then training continues', async ({ page }) => {
  await seed(page, {
    progress: progress({ levelIndex: 16, bestIndex: 16, drillDue: true }), // t5-s1
    tests: [pretest()],
  })
  await expect(page.getByRole('heading', { name: 'Focus drill' })).toBeVisible()
  await expect(page.getByText(/Extra practice on/)).toBeVisible()
  await page.getByRole('button', { name: 'Start' }).click()
  expect(await playLevel(page, correct)).toBe(20)
  await expect(page.getByText('Focus drill done — back to your level.')).toBeVisible()
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('heading', { name: '5 pitches · step 1 of 8' })).toBeVisible()
})

test('speed tier shows the shorter deadline', async ({ page }) => {
  await seed(page, { progress: progress({ levelIndex: 80, bestIndex: 80 }), tests: [pretest()] })
  await expect(page.getByText('Speed 1 of 3 · answer within 3.5 s')).toBeVisible()
  await expect(page.getByText(/answer within 3\.5 s/).first()).toBeVisible()
})

test('mastery: the 4th pass is locked until 12 h after the 3rd', async ({ page }) => {
  const now = Date.now()
  await seed(page, {
    progress: progress({
      levelIndex: 85,
      bestIndex: 85,
      finalPasses: [now - 3 * H, now - 2 * H, now - H],
    }),
    tests: [pretest()],
  })
  await expect(page.getByText('mastery passes 3/4')).toBeVisible()
  await expect(page.getByText(/Come back after/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start' })).toBeDisabled()
})

test('mastery: passing the 4th time completes the ladder and asks for the final test', async ({
  page,
}) => {
  const now = Date.now()
  await seed(page, {
    progress: progress({
      levelIndex: 85,
      bestIndex: 85,
      finalPasses: [now - 30 * H, now - 29 * H, now - 13 * H],
    }),
    tests: [pretest()],
  })
  await page.getByRole('button', { name: 'Start' }).click()
  await playLevel(page, correct)
  await expect(page.getByText(/You mastered the whole ladder/)).toBeVisible()
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('heading', { name: 'Mastered' })).toBeVisible()
  await expect(page.getByText('Final test due.')).toBeVisible()
})

test('weekly test is due 7 days after the last test', async ({ page }) => {
  await seed(page, { progress: progress({}), tests: [pretest(Date.now() - 8 * DAY)] })
  await expect(page.getByText('Weekly test due.')).toBeVisible()
  await page.getByRole('link', { name: 'Take it now' }).click()
  await expect(page).toHaveURL(/\/test\/weekly$/)
  await expect(page.getByRole('heading', { name: 'Weekly test' })).toBeVisible()
})

test('pitch memory check: matching every tone exactly scores 0 cents', async ({ page }) => {
  await page.goto('/pitch-memory')
  await page.getByRole('button', { name: 'Start' }).click()
  for (let round = 0; round < 12; round++) {
    const card = page.locator('[data-stage="adjust"]')
    await expect(card).toBeVisible()
    await expect(page.getByText(`Round ${round + 1} / 12`)).toBeVisible()
    for (;;) {
      const offset = Number(await card.getAttribute('data-e2e-offset'))
      if (offset === 0) break
      await page.keyboard.press(offset > 0 ? 'ArrowDown' : 'ArrowUp')
      await expect(card).not.toHaveAttribute('data-e2e-offset', String(offset))
    }
    await page.keyboard.press('Enter')
  }
  await expect(page.getByRole('heading', { name: 'Average error: 0 cents' })).toBeVisible()
  await expect(page.getByText(/Very precise/)).toBeVisible()
})

test('progress page: charts render with hover tooltip and table view', async ({ page }) => {
  const now = Date.now()
  const sessions = [0, 1, 2, 4, 9].map((d, i) => ({
    id: `s${i}`,
    module: 'ap',
    startedAt: now - d * DAY,
    endedAt: now - d * DAY + 1000,
    activeMs: (10 + i * 8) * 60_000,
    meta: {},
  }))
  const tests = [
    pretest(now - 20 * DAY),
    {
      id: 'w1',
      kind: 'weekly',
      takenAt: now - 10 * DAY,
      metrics: { accuracy: 0.31, mad: 1.6, band: 'emerging', untrained: { accuracy: 0.25 } },
    },
    {
      id: 'w2',
      kind: 'weekly',
      takenAt: now - 2 * DAY,
      metrics: { accuracy: 0.55, mad: 1.0, band: 'emerging', untrained: { accuracy: 0.4 } },
    },
  ]
  await seed(page, { progress: progress({ points: 420 }), tests, sessions }, '/progress')
  await expect(page.getByText('Training minutes per day (last 4 weeks)')).toBeVisible()
  await expect(page.locator('figure path.bar')).toHaveCount(5)
  await expect(page.locator('figure circle.dot')).toHaveCount(3)
  await expect(page.locator('text.end')).toHaveText('55%')
  // Hover a column → tooltip with value; focus works too.
  const hits = page.locator('rect.hit')
  await hits.last().hover()
  await expect(page.locator('.tooltip').first()).toContainText('min')
  await page.getByText('Show as table').click()
  await expect(page.locator('details table tbody tr')).toHaveCount(28)
  await expect(page.getByText('Emerging').first()).toBeVisible()
  await page.screenshot({ path: 'test-results/progress-light.png', fullPage: true })
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.screenshot({ path: 'test-results/progress-dark.png', fullPage: true })
})
