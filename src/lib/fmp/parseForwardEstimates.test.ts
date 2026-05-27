import { describe, expect, it } from 'vitest'

import {
  buildForwardGrowthChartsFromPack,
  formatForwardEstimatesBlock,
  forwardEstimatesToGrowthCharts,
  lastActualFiscalYearFromIncome,
  parseForwardEstimatesFromFmp,
} from './parseForwardEstimates'

/** Yahoo Finance–style META consensus (May 2026) for parser sanity checks. */
const META_ANALYST_ROWS = [
  {
    date: '2028-12-31',
    calendarYear: 2028,
    estimatedRevenueAvg: 352_680_000_000,
    estimatedEpsAvg: 40.92,
  },
  {
    date: '2027-12-31',
    calendarYear: 2027,
    estimatedRevenueAvg: 301_700_000_000,
    estimatedEpsAvg: 36.01,
  },
  {
    date: '2026-12-31',
    calendarYear: 2026,
    estimatedRevenueAvg: 253_080_000_000,
    estimatedEpsAvg: 32.32,
  },
  {
    date: '2025-12-31',
    calendarYear: 2025,
    estimatedRevenueAvg: 200_970_000_000,
    estimatedEpsAvg: 23.49,
  },
]

describe('parseForwardEstimatesFromFmp', () => {
  it('excludes years at or before last actual fiscal year', () => {
    const lastActual = lastActualFiscalYearFromIncome([{ calendarYear: 2025, revenue: 200e9 }])
    expect(lastActual).toBe(2025)

    const series = parseForwardEstimatesFromFmp('META', META_ANALYST_ROWS, {
      maxYears: 3,
      lastActualFiscalYear: 2025,
    })

    expect(series.revenue.map((p) => p.fiscalYear)).toEqual([2026, 2027, 2028])
    expect(series.eps.map((p) => p.fiscalYear)).toEqual([2026, 2027, 2028])
    expect(series.revenue[0]!.revenueUsd).toBeCloseTo(253.08e9, -6)
    expect(series.eps[0]!.eps).toBeCloseTo(32.32, 2)
  })

  it('builds aligned chart points for revenue and EPS', () => {
    const series = parseForwardEstimatesFromFmp('META', META_ANALYST_ROWS, {
      maxYears: 3,
      lastActualFiscalYear: 2025,
    })
    const charts = forwardEstimatesToGrowthCharts(series)
    expect(charts?.points).toHaveLength(3)
    expect(charts?.points[0]).toMatchObject({
      fiscalYear: 2026,
      label: 'FY2026',
      revenueUsd: expect.any(Number),
      eps: expect.any(Number),
    })
  })

  it('buildForwardGrowthChartsFromPack uses income for last actual FY', () => {
    const charts = buildForwardGrowthChartsFromPack('META', META_ANALYST_ROWS, [
      { calendarYear: 2025, revenue: 200e9 },
    ])
    expect(charts?.points.map((p) => p.fiscalYear)).toEqual([2026, 2027, 2028])
  })

  it('formats block like the Gemini prompt example', () => {
    const series = parseForwardEstimatesFromFmp('META', META_ANALYST_ROWS, {
      maxYears: 3,
      lastActualFiscalYear: 2025,
    })
    const block = formatForwardEstimatesBlock('META', series)
    expect(block).toContain('FY2026: $253.08B')
    expect(block).toContain('FY2026: $32.32')
  })
})
