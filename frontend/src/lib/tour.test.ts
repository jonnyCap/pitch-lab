import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hasSeenTour, markTourSeen, resetTours, toursEnabled } from './tour'

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('tour state', () => {
  it('starts unseen, remembers per id, and resets', () => {
    expect(hasSeenTour('a')).toBe(false)
    markTourSeen('a')
    expect(hasSeenTour('a')).toBe(true)
    expect(hasSeenTour('b')).toBe(false)
    markTourSeen('b')
    expect(hasSeenTour('a')).toBe(true)
    resetTours()
    expect(hasSeenTour('a')).toBe(false)
  })
  it('ignores corrupt storage', () => {
    localStorage.setItem('pitchlab-tours', '{nope')
    expect(hasSeenTour('a')).toBe(false)
    localStorage.setItem('pitchlab-tours', '[1]')
    expect(hasSeenTour('a')).toBe(false)
    markTourSeen('a')
    expect(hasSeenTour('a')).toBe(true)
  })
  it('never throws when storage fails', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(hasSeenTour('a')).toBe(false)
    expect(() => markTourSeen('a')).not.toThrow()
    expect(() => resetTours()).not.toThrow()
  })
  it('tours are enabled outside E2E', () => {
    expect(toursEnabled()).toBe(true)
  })
})
