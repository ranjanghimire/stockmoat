import { describe, expect, it } from 'vitest'
import { semisHardwareAdapter } from './semisHardwareAdapter'

describe('semisHardwareAdapter', () => {
  it('returns semis method ids for mid cycle', () => {
    const methods = semisHardwareAdapter.activeMethods('cyclical_mid')
    expect(methods).toContain('ev_ebitda')
    expect(methods).toContain('peg_implied_pe')
  })

  it('method weights sum to ~1 for mid cycle', () => {
    const w = semisHardwareAdapter.methodWeights('cyclical_mid')
    const sum = Object.values(w).reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(1, 2)
  })
})
