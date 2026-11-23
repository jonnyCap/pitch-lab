import { describe, expect, it } from 'vitest'
import { timbreConfig } from './timbres'

describe('timbreConfig', () => {
  it('prefers real instruments when all sample sets exist', () => {
    expect(timbreConfig(['complex', 'piano', 'violin', 'clarinet', 'harp'])).toEqual({
      trained: ['piano', 'violin', 'clarinet'],
      untrained: 'harp',
      usingSamples: true,
    })
  })
  it('falls back to synth timbres', () => {
    const c = timbreConfig(['complex', 'triangle', 'bright', 'square', 'piano'])
    expect(c.usingSamples).toBe(false)
    expect(c.trained).not.toContain(c.untrained)
  })
})
