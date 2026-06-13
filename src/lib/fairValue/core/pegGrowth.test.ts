import { describe, expect, it } from 'vitest'
import { resolvePegGrowthPercent, MAX_PEG_GROWTH_PCT } from './pegGrowth'
import type { CompanyFacts } from '../../fmp/buildCompanyFacts'

describe('resolvePegGrowthPercent', () => {
  function baseFacts(overrides: Partial<CompanyFacts> = {}): CompanyFacts {
    return {
      symbol: 'TSM',
      companyName: 'TSMC',
      sector: 'Technology',
      industry: 'Semiconductors',
      annualEps: [6.5, 5.8],
      annualGrossMargin: [],
      annualRevenue: [],
      annualEfficiencyRatio: [],
      ...overrides,
    }
  }

  it('prefers FMP epsGrowthPercent when present', () => {
    expect(resolvePegGrowthPercent(baseFacts({ epsGrowthPercent: 28 }))).toBe(28)
  })

  it('caps extreme YoY EPS spikes', () => {
    expect(
      resolvePegGrowthPercent(
        baseFacts({
          annualEps: [6.5, 0.32],
          pegRatio: 0.05,
          peTrailing: 29,
        }),
      ),
    ).toBe(MAX_PEG_GROWTH_PCT)
  })

  it('ignores unreliable pegRatio fallback when peg is tiny', () => {
    expect(
      resolvePegGrowthPercent(
        baseFacts({
          annualEps: [6.5, 6.2],
          pegRatio: 0.05,
          peTrailing: 29,
        }),
      ),
    ).toBeLessThan(10)
  })
})
