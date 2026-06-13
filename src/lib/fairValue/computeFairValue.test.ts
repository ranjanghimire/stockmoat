import { describe, expect, it } from 'vitest'
import { computeFairValue } from './computeFairValue'
import type { CompanyFacts } from '../fmp/buildCompanyFacts'
import type { PeerMedians } from '../fmp/peerMedians'

function saasFacts(overrides: Partial<CompanyFacts> = {}): CompanyFacts {
  return {
    symbol: 'MSFT',
    companyName: 'Microsoft',
    sector: 'Technology',
    industry: 'Software',
    price: 200,
    mktCap: 1500e9,
    enterpriseValue: 1520e9,
    grossMargin: 0.7,
    operatingMargin: 0.42,
    fcfYield: 0.04,
    fcfTtmAbsolute: 60e9,
    revenueTtmAbsolute: 200e9,
    totalDebt: 50e9,
    cashAndEquivalents: 80e9,
    annualEps: [10, 8],
    annualGrossMargin: [0.68, 0.67],
    annualRevenue: [200e9, 180e9],
    annualEfficiencyRatio: [],
    ...overrides,
  }
}

const peers: PeerMedians = {
  n: 10,
  enterpriseValueToGrossProfit: 10,
  enterpriseValueToRevenue: 5,
  fcfYield: 0.035,
}

describe('computeFairValue', () => {
  it('computes CFV for profitable SaaS', () => {
    const result = computeFairValue({
      symbol: 'MSFT',
      facts: saasFacts(),
      peers,
      moatScore: 8.2,
      safetyGateFailed: false,
      forwardEstimates: {
        symbol: 'MSFT',
        source: 'fmp',
        revenue: [
          { fiscalYear: 2027, revenueUsd: 220e9 },
          { fiscalYear: 2028, revenueUsd: 250e9 },
        ],
        eps: [
          { fiscalYear: 2027, eps: 11 },
          { fiscalYear: 2028, eps: 12.5 },
        ],
      },
      incomeAnnual: [
        { revenue: 200e9, grossProfit: 140e9, weightedAverageShsOutDil: 7.5e9, ebitda: 90e9, operatingIncome: 84e9 },
        { revenue: 180e9, ebitda: 75e9 },
      ],
      incomeQuarterly: [],
      profileId: 'software_saas',
    })

    expect(result).not.toBeNull()
    expect(result!.cfv.base).toBeGreaterThan(0)
    expect(result!.profileId).toBe('software_saas')
    expect(result!.methods.filter((m) => m.status === 'ok').length).toBeGreaterThanOrEqual(2)
  })

  it('returns null when shares unavailable', () => {
    const result = computeFairValue({
      symbol: 'X',
      facts: saasFacts({ mktCap: undefined, price: undefined }),
      peers,
      moatScore: 7,
      safetyGateFailed: false,
      forwardEstimates: null,
      incomeAnnual: [{ revenue: 1e9 }],
      incomeQuarterly: [],
      profileId: 'software_saas',
    })
    expect(result).toBeNull()
  })

  it('normalized peak semi CFV below trailing-implied at high price', () => {
    const result = computeFairValue({
      symbol: 'NVDA',
      facts: saasFacts({
        symbol: 'NVDA',
        price: 180,
        revenueTtmAbsolute: 40e9,
        grossMargin: 0.65,
        operatingMargin: 0.35,
        fcfTtmAbsolute: 15e9,
        fcfYield: 0.02,
        annualRevenue: [40e9, 30e9],
        annualEps: [5, 3],
      }),
      peers: {
        n: 10,
        evToEbitda: 16,
        evToEbit: 20,
        fcfYield: 0.03,
      },
      moatScore: 7.5,
      safetyGateFailed: false,
      forwardEstimates: null,
      incomeAnnual: [
        { revenue: 40e9, ebitda: 16e9, operatingIncome: 14e9, weightedAverageShsOutDil: 2e9 },
        { revenue: 30e9, ebitda: 9e9, operatingIncome: 8e9 },
        { revenue: 28e9, ebitda: 8e9, operatingIncome: 7e9 },
        { revenue: 26e9, ebitda: 7.5e9, operatingIncome: 6.5e9 },
        { revenue: 24e9, ebitda: 7e9, operatingIncome: 6e9 },
      ],
      incomeQuarterly: [],
      profileId: 'semis_hardware',
    })

    expect(result).not.toBeNull()
    expect(result!.subProfileId).toBe('cyclical_peak')
    expect(result!.cfv.base).toBeLessThan(180)
  })

  it('computes CFV for consumer profile (AMZN-like)', () => {
    const result = computeFairValue({
      symbol: 'AMZN',
      facts: saasFacts({
        symbol: 'AMZN',
        price: 180,
        revenueTtmAbsolute: 600e9,
        fcfTtmAbsolute: 35e9,
        fcfYield: 0.02,
        annualRevenue: [600e9, 550e9],
        annualEps: [3.5, 2.8],
      }),
      peers: {
        n: 10,
        evToEbitda: 15,
        evToEbit: 20,
        fcfYield: 0.03,
      },
      moatScore: 7.5,
      safetyGateFailed: false,
      forwardEstimates: null,
      incomeAnnual: [
        { revenue: 600e9, ebitda: 85e9, operatingIncome: 60e9, weightedAverageShsOutDil: 10.5e9 },
      ],
      incomeQuarterly: [],
      profileId: 'consumer_staples_discretionary_general',
    })

    expect(result).not.toBeNull()
    expect(result!.profileId).toBe('consumer_staples_discretionary_general')
    expect(result!.subProfileId).toBe('standard')
    expect(result!.cfv.base).toBeGreaterThan(0)
  })

  it('computes CFV for bank using P/TBV', () => {
    const result = computeFairValue({
      symbol: 'JPM',
      facts: saasFacts({
        symbol: 'JPM',
        price: 200,
        revenueTtmAbsolute: 0,
        totalEquity: 300e9,
        priceToTangibleBook: 2.0,
        annualEps: [18, 16],
      }),
      peers: { n: 8, priceToBook: 1.5 },
      moatScore: 7,
      safetyGateFailed: false,
      forwardEstimates: null,
      incomeAnnual: [{ weightedAverageShsOutDil: 2.9e9 }],
      incomeQuarterly: [],
      profileId: 'banks_thrifts',
    })

    expect(result).not.toBeNull()
    expect(result!.methods.some((m) => m.methodId === 'price_to_tangible_book' && m.status === 'ok')).toBe(true)
  })

  it('computes CFV for REIT using P/FFO', () => {
    const result = computeFairValue({
      symbol: 'O',
      facts: saasFacts({
        symbol: 'O',
        price: 60,
        ffoPerShare: 4,
        revenueTtmAbsolute: 3e9,
        annualEps: [1.2, 1.1],
      }),
      peers: { n: 8, priceToFfo: 15, evToEbitda: 18, fcfYield: 0.05 },
      moatScore: 7,
      safetyGateFailed: false,
      forwardEstimates: null,
      incomeAnnual: [{ revenue: 3e9, ebitda: 2e9, operatingIncome: 1.5e9, weightedAverageShsOutDil: 700e6 }],
      incomeQuarterly: [],
      profileId: 'reits',
    })

    expect(result).not.toBeNull()
    expect(result!.methods.some((m) => m.methodId === 'p_ffo' && m.status === 'ok')).toBe(true)
  })

  it('computes CFV for cyclical energy with peak normalization', () => {
    const result = computeFairValue({
      symbol: 'XOM',
      facts: saasFacts({
        symbol: 'XOM',
        price: 110,
        revenueTtmAbsolute: 350e9,
        fcfTtmAbsolute: 25e9,
        fcfYield: 0.055,
        annualRevenue: [350e9, 280e9],
        annualEps: [8, 6],
      }),
      peers: {
        n: 10,
        evToEbitda: 6,
        evToEbit: 8,
        fcfYield: 0.07,
      },
      moatScore: 6.5,
      safetyGateFailed: false,
      forwardEstimates: null,
      incomeAnnual: [
        { revenue: 350e9, ebitda: 70e9, operatingIncome: 55e9, weightedAverageShsOutDil: 4.2e9 },
        { revenue: 280e9, ebitda: 45e9, operatingIncome: 35e9 },
        { revenue: 260e9, ebitda: 42e9, operatingIncome: 32e9 },
        { revenue: 250e9, ebitda: 40e9, operatingIncome: 30e9 },
        { revenue: 240e9, ebitda: 38e9, operatingIncome: 28e9 },
      ],
      incomeQuarterly: [],
      profileId: 'energy_exploration_production',
    })

    expect(result).not.toBeNull()
    expect(result!.profileId).toBe('energy_exploration_production')
    expect(result!.subProfileId).toBe('cyclical_peak')
    expect(result!.cfv.base).toBeGreaterThan(0)
  })
})
