import { describe, expect, it } from 'vitest'
import { columnPath, niceTicks } from './scale'

describe('chart scales', () => {
  it('niceTicks covers the max with clean steps', () => {
    expect(niceTicks(34)).toEqual([0, 10, 20, 30, 40])
    expect(niceTicks(60)).toEqual([0, 20, 40, 60])
    expect(niceTicks(1, 4)).toEqual([0, 0.25, 0.5, 0.75, 1])
    expect(niceTicks(0)).toEqual([0, 1])
  })
  it('columnPath is empty for zero height and rounded otherwise', () => {
    expect(columnPath(0, 10, 20, 0)).toBe('')
    expect(columnPath(0, 10, 20, 30)).toContain('Q')
  })
})
