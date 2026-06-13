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
    analystEstimatesQuarterly: [],
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

  it('reads priceEarningsToGrowthRatioTTM from ratios TTM', () => {
    const pack = minimalPack({
      keyMetricsTtm: { peRatio: 30 },
      ratiosTtm: { priceEarningsToGrowthRatioTTM: 1.5 },
    })

    const facts = buildCompanyFacts('MRVL', pack)
    expect(facts.pegRatio).toBe(1.5)
  })

  it('falls back to ratios aliases when key-metrics PEG is absent', () => {
    const pack = minimalPack({
      keyMetricsTtm: { peRatio: 20 },
      ratiosTtm: { pegRatioTTM: 1.11 },
    })

    const facts = buildCompanyFacts('MRVL', pack)
    expect(facts.pegRatio).toBe(1.11)
  })

  it('computes PEG from trailing P/E and annual EPS YoY growth when FMP omits PEG', () => {
    const pack = minimalPack({
      quote: { price: 100, marketCap: 1_000_000_000, pe: 25, currency: 'USD' },
      incomeAnnual: [{ eps: 2.0 }, { eps: 1.6 }],
    })

    const facts = buildCompanyFacts('MRVL', pack)
    expect(facts.peTrailing).toBe(25)
    expect(facts.pegRatio).toBeCloseTo(25 / 25, 4)
  })

  it('computes PEG from FMP eps growth field when direct PEG is missing', () => {
    const pack = minimalPack({
      quote: { price: 100, marketCap: 1_000_000_000, pe: 20, currency: 'USD' },
      ratiosTtm: { epsGrowthTTM: 0.1 },
    })

    const facts = buildCompanyFacts('MRVL', pack)
    expect(facts.pegRatio).toBeCloseTo(2, 4)
  })

  it('reconciles shares outstanding with market cap when annual filing is wrong (TSM-like)', () => {
    const pack = minimalPack({
      quote: { price: 190, marketCap: 990e9, sharesOutstanding: 5.19e9, currency: 'USD' },
      incomeAnnual: [{ weightedAverageShsOutDil: 38.7e6, revenue: 90e9, ebitda: 50e9 }],
    })

    const facts = buildCompanyFacts('TSM', pack)
    expect(facts.sharesOutstanding).toBeCloseTo(5.19e9, -6)
  })

  it('formats headquarters from profile city, state, and country', () => {
    const pack = minimalPack({
      profile: {
        companyName: 'Microsoft Corporation',
        sector: 'Technology',
        industry: 'Software',
        city: 'Redmond',
        state: 'WA',
        country: 'US',
      },
    })

    const facts = buildCompanyFacts('MSFT', pack)
    expect(facts.headquarters).toBe('Redmond, WA, US')
  })
})
