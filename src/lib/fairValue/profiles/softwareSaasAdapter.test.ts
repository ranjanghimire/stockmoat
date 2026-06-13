import { describe, expect, it } from 'vitest'
import { softwareSaasAdapter } from './softwareSaasAdapter'
import type { FairValueBuildContext } from '../types'

function ctx(partial: Partial<FairValueBuildContext>): FairValueBuildContext {
  return {
    input: {
      symbol: 'MSFT',
      facts: {
        symbol: 'MSFT',
        companyName: 'Microsoft',
        sector: 'Technology',
        industry: 'Software',
        annualEps: [10, 8],
        annualGrossMargin: [],
        annualRevenue: [200e9, 180e9],
        annualEfficiencyRatio: [],
        operatingMargin: 0.42,
        fcfYield: 0.03,
      },
      peers: { n: 10, enterpriseValueToGrossProfit: 10, fcfYield: 0.035 },
      moatScore: 8,
      safetyGateFailed: false,
      forwardEstimates: null,
      incomeAnnual: [],
      incomeQuarterly: [],
      profileId: 'software_saas',
    },
    subProfileId: 'insufficient',
    operating: {
      revenueTtm: 200e9,
      grossProfitTtm: 140e9,
      fcfTtm: 60e9,
      netDebt: 10e9,
      shares: 7.5e9,
    },
    qualityMultiplier: 1,
    qualityNotes: [],
    warnings: [],
    ...partial,
  }
}

describe('softwareSaasAdapter', () => {
  it('classifies profitable SaaS when FCF and margins positive', () => {
    expect(softwareSaasAdapter.classifySubProfile(ctx({}))).toBe('profitable_saas')
  })

  it('classifies growth SaaS when FCF negative', () => {
    const c = ctx({})
    c.operating.fcfTtm = -5e9
    c.input.facts.fcfYield = undefined
    c.input.facts.operatingMargin = -0.1
    expect(softwareSaasAdapter.classifySubProfile(c)).toBe('growth_saas')
  })

  it('applies quality multiplier above 1 for strong moat and rule of 40', () => {
    const { q } = softwareSaasAdapter.computeQualityMultiplier(ctx({}))
    expect(q).toBeGreaterThan(1)
  })
})
