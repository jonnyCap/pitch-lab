import { describe, expect, it } from 'vitest'
import { blend, parseColor, rgba } from './color'

describe('parseColor', () => {
  it('parses hex forms', () => {
    expect(parseColor('#1E40FF')).toEqual([30, 64, 255, 1])
    expect(parseColor('#fff')).toEqual([255, 255, 255, 1])
    expect(parseColor('#00000080')![3]).toBeCloseTo(0.5, 1)
  })
  it('parses rgb() in legacy and modern syntax', () => {
    expect(parseColor('rgb(30, 64, 255)')).toEqual([30, 64, 255, 1])
    expect(parseColor('rgb(30 64 255 / 0.08)')).toEqual([30, 64, 255, 0.08])
    expect(parseColor('rgba(142,160,255,0.14)')).toEqual([142, 160, 255, 0.14])
    expect(parseColor('rgb(10% 0% 100% / 50%)')).toEqual([26, 0, 255, 0.5])
  })
  it('parses color(srgb)', () => {
    expect(parseColor('color(srgb 1 0 0.5 / 0.5)')).toEqual([255, 0, 128, 0.5])
  })
  it('rejects junk', () => {
    expect(parseColor('')).toBeNull()
    expect(parseColor('oklch(0.5 0.1 200)')).toBeNull()
    expect(parseColor('#12')).toBeNull()
  })
})

describe('rgba / blend', () => {
  it('multiplies alpha and clamps', () => {
    expect(rgba([1, 2, 3, 0.5], 0.5)).toBe('rgba(1,2,3,0.250)')
    expect(rgba([1, 2, 3, 1], 3)).toBe('rgba(1,2,3,1.000)')
  })
  it('blends', () => {
    expect(blend([0, 0, 0, 1], [100, 200, 50, 1], 0.5)).toEqual([50, 100, 25, 1])
  })
})
