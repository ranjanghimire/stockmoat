import { describe, expect, it } from 'vitest'
import type { ForwardGrowthCharts } from './parseForwardEstimates'
import {
  extractForwardRevenueEstimateWindow,
  forwardRevenueCagrFromCharts,
  forwardRevenueCagrFromWindow,
  percentileForwardGrowthScores,
} from './forwardRevenueGrowthScore'

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

describe('forwardRevenueGrowthScore', () => {
  it('extracts first three consecutive estimate revenue years', () => {
    const charts = chartsWithEstimates([2027, 2028, 2029], [100, 121, 146])
    expect(extractForwardRevenueEstimateWindow(charts)).toEqual({
      years: [2027, 2028, 2029],
      revenuesUsd: [100, 121, 146],
    })
  })

  it('rolls window with chart years (2028–2030)', () => {
    const charts = chartsWithEstimates([2028, 2029, 2030], [200, 220, 242])
    expect(extractForwardRevenueEstimateWindow(charts)?.years).toEqual([2028, 2029, 2030])
  })

  it('returns undefined when estimate years are not consecutive', () => {
    const charts: ForwardGrowthCharts = {
      symbol: 'X',
      points: [
        { fiscalYear: 2027, label: 'FY2027', kind: 'estimate', revenueUsd: 1 },
        { fiscalYear: 2029, label: 'FY2029', kind: 'estimate', revenueUsd: 2 },
        { fiscalYear: 2030, label: 'FY2030', kind: 'estimate', revenueUsd: 3 },
      ],
    }
    expect(extractForwardRevenueEstimateWindow(charts)).toBeUndefined()
  })

  it('computes 2-year CAGR from first to third estimate year', () => {
    const window = extractForwardRevenueEstimateWindow(
      chartsWithEstimates([2027, 2028, 2029], [100, 110, 144]),
    )!
    const cagr = forwardRevenueCagrFromWindow(window)
    expect(cagr).toBeCloseTo(0.2, 5)
    expect(forwardRevenueCagrFromCharts(chartsWithEstimates([2027, 2028, 2029], [100, 110, 144]))).toBeCloseTo(
      0.2,
      5,
    )
  })

  it('maps CAGR percentiles to 1–10', () => {
    const scores = percentileForwardGrowthScores([
      { symbol: 'LOW', cagr: 0.05 },
      { symbol: 'MID', cagr: 0.15 },
      { symbol: 'HIGH', cagr: 0.35 },
    ])
    expect(scores.get('LOW')).toBeLessThan(scores.get('HIGH')!)
    expect(scores.get('HIGH')).toBe(10)
  })
})
