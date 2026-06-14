import { describe, expect, it } from 'vitest'
import type { MoatAnalysis } from '../computeMoatAnalysis'
import type { ForwardGrowthCharts } from '../fmp/parseForwardEstimates'
import { buildScreenScoreUpsert } from './buildScreenScoreUpsert'

function minimalAnalysis(overrides: Partial<MoatAnalysis> = {}): MoatAnalysis {
  return {
    ticker: 'TEST',
    displayName: 'Test Co',
    profileId: 'software_saas',
    score: 7.5,
    rawWeighted: 0.72,
    anyGateFail: false,
    scoreCap: 6,
    metrics: [],
    pillars: [
      { pillar: 'valuation', weight: 0.2, contribution: 0.15, pillarScore: 7.2 },
      { pillar: 'quality', weight: 0.2, contribution: 0.16, pillarScore: 8.0 },
      { pillar: 'safety', weight: 0.2, contribution: 0.14, pillarScore: 6.5 },
      { pillar: 'cash_truth', weight: 0.2, contribution: 0.13, pillarScore: 7.0 },
      { pillar: 'stability', weight: 0.2, contribution: 0.14, pillarScore: 6.8 },
    ],
    dataSource: 'fmp',
    ...overrides,
  }
}

function chartsWithEstimates(
  years: [number, number, number],
  revs: [number, number, number],
): ForwardGrowthCharts {
  return {
    symbol: 'TEST',
    points: years.map((y, i) => ({
      fiscalYear: y,
      label: `FY${y}`,
      kind: 'estimate' as const,
      revenueUsd: revs[i],
    })),
  }
}

describe('buildScreenScoreUpsert', () => {
  it('maps pillar scores to screen_scores columns', () => {
    const row = buildScreenScoreUpsert(minimalAnalysis())
    expect(row.valuation_score).toBe(7.2)
    expect(row.quality_score).toBe(8.0)
    expect(row.balance_sheet_score).toBe(6.5)
    expect(row.cash_truth_score).toBe(7.0)
    expect(row.stability_score).toBe(6.8)
  })

  it('computes ffv2_price_ratio from fair value snapshot', () => {
    const row = buildScreenScoreUpsert(
      minimalAnalysis({
        fundamentals: {
          fairValue: {
            cfv: { low: 90, base: 100, high: 110 },
            ffv2: { low: 225, base: 250, high: 275 },
            marketPrice: 100,
            asOf: '2026-06-14',
            profileId: 'software_saas',
            subProfileId: 'profitable_saas',
            qualityMultiplier: 1,
            confidence: 'high',
            methods: [],
            warnings: [],
          },
          marketCapUsd: 50e9,
        },
      }),
    )
    expect(row.ffv2_price_ratio).toBeCloseTo(2.5, 5)
    expect(row.market_cap_usd).toBe(50e9)
  })

  it('sets forward_rev_monotonic_3y true for strictly rising estimates', () => {
    const row = buildScreenScoreUpsert(
      minimalAnalysis({
        fundamentals: {
          forwardGrowth: chartsWithEstimates([2027, 2028, 2029], [100, 121, 146]),
        },
      }),
    )
    expect(row.forward_rev_monotonic_3y).toBe(true)
  })

  it('sets forward_rev_monotonic_3y false when middle year dips', () => {
    const row = buildScreenScoreUpsert(
      minimalAnalysis({
        fundamentals: {
          forwardGrowth: chartsWithEstimates([2027, 2028, 2029], [100, 121, 120]),
        },
      }),
    )
    expect(row.forward_rev_monotonic_3y).toBe(false)
  })

  it('sets forward_rev_monotonic_3y null when no estimate window', () => {
    const row = buildScreenScoreUpsert(minimalAnalysis())
    expect(row.forward_rev_monotonic_3y).toBeNull()
  })
})
