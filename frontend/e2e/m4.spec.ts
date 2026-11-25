import { expect, test } from '@playwright/test'
import { practise } from './helpers'

test('harmony lessons: notation, key signature and the circle of fifths', async ({ page }) => {
  await page.goto('/learn/lesson/key-signatures')
  await expect(
    page.getByRole('heading', { name: 'Key signatures and the circle of fifths' }),
  ).toBeVisible()
  await expect(page.getByRole('group', { name: 'Circle of fifths' })).toBeVisible()
  await page.getByRole('button', { name: 'G major' }).click()
  await expect(page.locator('.circle .center')).toContainText('G major')
  await expect(page.locator('.circle .center')).toContainText('E minor')
  await expect(page.locator('.circle .center')).toContainText('1 sharp')
  await page.getByRole('button', { name: 'E♭ major' }).click()
  await expect(page.locator('.circle .center')).toContainText('3 flats')

  await page.goto('/learn/lesson/scales')
  await expect.poll(() => page.locator('.staff svg').count()).toBeGreaterThanOrEqual(4)
  await page.goto('/learn/lesson/note-values')
  await expect(page.locator('.rhythm svg').first()).toBeVisible()
  await expect(page.getByRole('button', { name: '▶ Listen' }).first()).toBeVisible()
})

for (const deck of [
  'key-signatures',
  'scales-sight',
  'scales-ear',
  'chords-sight',
  'inversions',
  'chords-ear',
  'note-values',
]) {
  test(`practice deck: ${deck}`, async ({ page }) => {
    await page.goto(`/learn/practice/${deck}`)
    const answered = await practise(page)
    expect(answered).toBeGreaterThanOrEqual(2)
    await expect(page.locator('.summary h2')).toContainText('100%')
  })
}

test('learn hub shows all four modules and the rhythm trainer', async ({ page }) => {
  await page.goto('/learn')
  for (const h of ['Notes & staff', 'Scales, keys & chords', 'Rhythm']) {
    await expect(page.getByRole('heading', { name: h, exact: true })).toBeVisible()
  }
  await expect(page.locator('[data-deck]')).toHaveCount(14)
  await page.locator('[data-deck="rhythm-tap"]').getByRole('link', { name: 'Open' }).click()
  await expect(page).toHaveURL(/\/learn\/rhythm$/)
})

test('rhythm: calibrate, then three accurate patterns unlock level 2', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('/learn/rhythm')
  await page.getByRole('button', { name: 'Start calibration' }).click()
  await expect(page.locator('[data-stage="calibrating"]')).toBeVisible()
  // Tap 50 ms after each of the 8 clicks after the count-in.
  await page.evaluate(() => {
    const r = (window as unknown as { __rhythm: { tapAtClick: (i: number, o: number) => void } })
      .__rhythm
    for (let i = 4; i < 12; i++) r.tapAtClick(i, 50)
  })
  await expect(page.getByText('Calibrated: 50 ms delay will be compensated.')).toBeVisible({
    timeout: 15_000,
  })

  for (let n = 0; n < 3; n++) {
    await page.getByRole('button', { name: 'Tap it' }).click()
    await expect(
      page.locator('.exercise[data-stage="countin"], .exercise[data-stage="tapping"]'),
    ).toBeVisible()
    await page.evaluate(() => {
      const r = (
        window as unknown as {
          __rhythm: { tapAtBar: (o: number) => void; expectedOffsets: () => number[] }
        }
      ).__rhythm
      for (const o of r.expectedOffsets()) r.tapAtBar(o + 10)
    })
    await expect(page.locator('.result h2')).toHaveText('100%', { timeout: 15_000 })
    if (n < 2) {
      await expect(page.getByText(`${n + 1}/3 patterns`)).toBeVisible()
      await page.getByRole('button', { name: 'New pattern' }).click()
    }
  }
  await expect(page.getByText('Level up!')).toBeVisible()
  await expect(page.getByText('Level 2', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByText('Level 2', { exact: true })).toBeVisible()
})
