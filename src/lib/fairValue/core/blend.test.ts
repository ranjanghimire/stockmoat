import { describe, expect, it } from 'vitest'
import { applyEffectiveWeights, blendMethodPrices } from './blend'
import type { FairValueMethodResult } from '../types'

describe('blend', () => {
  it('renormalizes weights when some methods skip', () => {
    const methods: FairValueMethodResult[] = [
      {
        methodId: 'ev_gross_profit',
        status: 'ok',
        cfvPerShare: 100,
        weight: 0.3,
        effectiveWeight: 0,
        qualityMultiplier: 1,
        notes: [],
      },
      {
        methodId: 'fcf_yield_peer',
        status: 'skipped',
        weight: 0.4,
        effectiveWeight: 0,
        qualityMultiplier: 1,
        notes: [],
      },
      {
        methodId: 'ev_revenue',
        status: 'ok',
        cfvPerShare: 120,
        weight: 0.3,
        effectiveWeight: 0,
        qualityMultiplier: 1,
        notes: [],
      },
    ]
    const weighted = applyEffectiveWeights(methods)
    expect(weighted[0]!.effectiveWeight).toBeCloseTo(0.5, 4)
    expect(weighted[2]!.effectiveWeight).toBeCloseTo(0.5, 4)
    expect(blendMethodPrices(weighted, 'cfvPerShare')).toBeCloseTo(110, 4)
  })
})
