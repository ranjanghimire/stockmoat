import { describe, expect, it } from 'vitest'

import { buildCompanyFacts, type CompanyFacts } from './buildCompanyFacts'
import type { CompanyRawPack } from './fetchCompanyRawPack'

function minimalPack(overrides: Partial<CompanyRawPack>): CompanyRawPack {
  return {
    profile: { companyName: 'TestCo', sector: 'Tech', industry: 'Semis', mktCap: 1_000_000_000 },
    quote: { price: 100, marketCap: 1_000_000_000, currency: 'USD' },
    keyMetricsTtm: undefined,
    ratiosTtm: undefined,
    incomeAnnual: [],
    incomeQuarterly: [],
    cashFlowAnnual: [],
    incomeTtm: undefined,
    cashFlowTtm: undefined,
    balanceSheetAnnual: [],
    balanceSheetQuarterly: [],
    analystEstimates: [],
    analystStockRecommendations: [],
    score: undefined,
    peers: [],
    ...overrides,
  }
}

describe('buildCompanyFacts', () => {
  it('reads PEG from common FMP alias fields when pegRatio is missing', () => {
    const pack = minimalPack({
      keyMetricsTtm: { pegRatioTTM: 1.23 },
      ratiosTtm: { pegTTM: 2.34 },
    })

    const facts: CompanyFacts = buildCompanyFacts('MRVL', pack)
    expect(facts.pegRatio).toBe(1.23)
  })

  it('falls back to ratios aliases when key-metrics PEG is absent', () => {
    const pack = minimalPack({
      keyMetricsTtm: { peRatio: 20 },
      ratiosTtm: { pegRatioTTM: 1.11 },
    })

    const facts = buildCompanyFacts('MRVL', pack)
    expect(facts.pegRatio).toBe(1.11)
  })
})

