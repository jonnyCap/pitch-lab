import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import CountUp from './CountUp.vue'
import ProgressTrack from './ProgressTrack.vue'
import Countdown from './Countdown.vue'
import CoachTour from './CoachTour.vue'
import SwipeCards from './SwipeCards.vue'
import { hasSeenTour } from '@/lib/tour'

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('matchMedia', () => ({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
  }))
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('CountUp', () => {
  it('exposes the final formatted value and shows it at once when motion is reduced', async () => {
    const w = mount(CountUp, { props: { value: 87.456, decimals: 1, suffix: '%', prefix: '~' } })
    await nextTick()
    expect(w.find('.countup-sr').text()).toBe('~87.5%')
    expect(w.find('.countup-vis').text()).toBe('~87.5%')
    expect(w.find('.countup-vis').attributes('aria-hidden')).toBe('true')
  })
})

describe('ProgressTrack', () => {
  it('marks done/current/todo and ok/bad results', () => {
    const w = mount(ProgressTrack, {
      props: { total: 5, index: 3, results: ['ok', 'bad', null] },
    })
    const segs = w.findAll('.seg')
    expect(segs.map((s) => s.attributes('data-state'))).toEqual([
      'done',
      'done',
      'done',
      'current',
      'todo',
    ])
    expect(segs[0]!.classes()).toContain('ok')
    expect(segs[1]!.classes()).toContain('bad')
    expect(segs[2]!.classes()).not.toContain('ok')
    expect(w.attributes('aria-valuenow')).toBe('3')
  })
  it('falls back to a continuous bar above 48', () => {
    const w = mount(ProgressTrack, { props: { total: 96, index: 24 } })
    expect(w.findAll('.seg')).toHaveLength(0)
    expect(w.find('.fill').attributes('style')).toContain('25%')
  })
})

describe('Countdown', () => {
  it('emits done after the sequence', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    const w = mount(Countdown, { props: { from: 2, stepMs: 100 } })
    await nextTick()
    expect(w.find('.num').text()).toBe('2')
    await vi.advanceTimersByTimeAsync(100)
    expect(w.find('.num').text()).toBe('1')
    await vi.advanceTimersByTimeAsync(100)
    expect(w.find('.num').text()).toBe('Go')
    expect(w.emitted('done')).toBeUndefined()
    await vi.advanceTimersByTimeAsync(100)
    expect(w.emitted('done')).toHaveLength(1)
  })
  it('does not emit after unmount', async () => {
    vi.useFakeTimers()
    const w = mount(Countdown, { props: { from: 2, stepMs: 100 } })
    w.unmount()
    await vi.advanceTimersByTimeAsync(1000)
    expect(w.emitted('done')).toBeUndefined()
  })
})

describe('CoachTour', () => {
  it('skips steps with missing targets, marks seen, restores focus', async () => {
    document.body.innerHTML = '<button id="opener">o</button><div data-tour="a">a</div>'
    const opener = document.getElementById('opener')!
    opener.focus()
    const w = mount(CoachTour, {
      attachTo: document.body,
      props: {
        id: 't1',
        autoStart: false,
        steps: [
          { target: '[data-tour="a"]', title: 'First', body: 'one' },
          { target: '[data-tour="missing"]', title: 'Ghost', body: 'x' },
          { title: 'Last', body: 'end' },
        ],
      },
    })
    ;(w.vm as unknown as { start: () => void }).start()
    await nextTick()
    await nextTick()
    const dlg = document.querySelector('[role="dialog"]')!
    expect(dlg.getAttribute('aria-modal')).toBe('true')
    expect(dlg.textContent).toContain('First')
    expect(dlg.textContent).toContain('1 / 2')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    await nextTick()
    await nextTick()
    expect(document.querySelector('[role="dialog"]')!.textContent).toContain('Last')
    expect(document.querySelector('[role="dialog"]')!.textContent).not.toContain('Ghost')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(hasSeenTour('t1')).toBe(true)
    expect(w.emitted('done')).toHaveLength(1)
    expect(document.activeElement).toBe(opener)
    w.unmount()
  })
  it('does not start when no targeted step resolves', async () => {
    const w = mount(CoachTour, {
      attachTo: document.body,
      props: { id: 't2', autoStart: false, steps: [{ target: '#nope', title: 'x', body: 'y' }] },
    })
    ;(w.vm as unknown as { start: () => void }).start()
    await nextTick()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    w.unmount()
  })
})

describe('SwipeCards', () => {
  it('renders the slot for the current step and navigates with arrow keys', async () => {
    const w = mount(SwipeCards, {
      props: { count: 3, modelValue: 0 },
      slots: { 'step-0': '<p>zero</p>', 'step-1': '<p>one</p>' },
      attachTo: document.body,
    })
    expect(w.text()).toContain('zero')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    expect(w.emitted('update:modelValue')?.[0]).toEqual([1])
    w.unmount()
  })
})
