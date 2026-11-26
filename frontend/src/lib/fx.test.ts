import { afterEach, describe, expect, it, vi } from 'vitest'
import { anchorPoint, haptic, makeParticles, popText } from './fx'

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('fx pure parts', () => {
  it('anchorPoint handles points and elements', () => {
    expect(anchorPoint({ x: 3, y: 4 })).toEqual({ x: 3, y: 4 })
    const el = document.createElement('div')
    el.getBoundingClientRect = () => ({ left: 10, top: 20, width: 40, height: 20 }) as DOMRect
    expect(anchorPoint(el)).toEqual({ x: 30, y: 30 })
  })
  it('makeParticles caps at 80, cycles colors, starts at origin', () => {
    const ps = makeParticles({ x: 5, y: 6 }, 500, ['a', 'b'], () => 0.5)
    expect(ps).toHaveLength(80)
    expect(ps[0]).toMatchObject({ x: 5, y: 6, color: 'a' })
    expect(ps[1]!.color).toBe('b')
    expect(makeParticles({ x: 0, y: 0 }, -3, [])).toHaveLength(0)
  })
  it('haptic vibrates when available and is safe otherwise', () => {
    const vibrate = vi.fn()
    vi.stubGlobal('navigator', { vibrate })
    haptic('ok')
    haptic('bad')
    expect(vibrate).toHaveBeenNthCalledWith(1, 12)
    expect(vibrate).toHaveBeenNthCalledWith(2, [18, 40, 18])
    vi.stubGlobal('navigator', {})
    expect(() => haptic('tap')).not.toThrow()
  })
  it('popText renders an aria-hidden overlay that cleans up', () => {
    const animate = vi.fn(() => ({}))
    Object.defineProperty(Element.prototype, 'animate', { value: animate, configurable: true })
    popText({ x: 1, y: 1 }, '+3', 'ok')
    delete (Element.prototype as { animate?: unknown }).animate
    const layer = document.querySelector('[data-fx-layer]')
    expect(layer?.getAttribute('aria-hidden')).toBe('true')
    expect(layer?.textContent).toBe('+3')
  })
  it('popText is a no-op under reduced motion', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    popText({ x: 1, y: 1 }, '+3')
    expect(document.querySelector('[data-fx-layer]')).toBeNull()
  })
})
