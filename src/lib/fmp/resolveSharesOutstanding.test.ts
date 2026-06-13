import { describe, expect, it } from 'vitest'

import { resolveSharesOutstanding } from './resolveSharesOutstanding'

describe('resolveSharesOutstanding', () => {
  it('reconciles bad annual share count with market cap for ADR listings (TSM-like)', () => {
    const shares = resolveSharesOutstanding({
      marketCap: 990e9,
      price: 190,
      incomeAnnual0: { weightedAverageShsOutDil: 38.7e6 },
      quote: { sharesOutstanding: 5.19e9 },
    })
    expect(shares).toBeCloseTo(5.19e9, -6)
  })

  it('prefers quote shares when aligned with market cap', () => {
    const shares = resolveSharesOutstanding({
      marketCap: 990e9,
      price: 190,
      quote: { sharesOutstanding: 5.19e9 },
      incomeAnnual0: { weightedAverageShsOutDil: 5.18e9 },
    })
    expect(shares).toBeCloseTo(5.19e9, -6)
  })

  it('falls back to market cap implied shares when only bad filing exists', () => {
    const shares = resolveSharesOutstanding({
      marketCap: 200e9,
      price: 100,
      incomeAnnual0: { weightedAverageShsOutDil: 25e6 },
    })
    expect(shares).toBe(2e9)
  })
})
