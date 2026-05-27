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
    date: '2029-12-31',
    calendarYear: 2029,
    estimatedRevenueAvg: 400_000_000_000,
    estimatedEpsAvg: 45,
  },
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

const META_INCOME_ACTUALS = [
  { calendarYear: 2025, revenue: 201_000_000_000, epsdiluted: 23.5 },
  { calendarYear: 2024, revenue: 165_000_000_000, epsdiluted: 19.2 },
  { calendarYear: 2023, revenue: 134_000_000_000, epsdiluted: 14.5 },
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

  it('minForwardFiscalYear keeps 2027–2029 when last actual is 2025', () => {
    const series = parseForwardEstimatesFromFmp('META', META_ANALYST_ROWS, {
      maxYears: 3,
      minForwardFiscalYear: 2027,
    })
    expect(series.revenue.map((p) => p.fiscalYear)).toEqual([2027, 2028, 2029])
  })

  it('builds aligned chart points for revenue and EPS', () => {
    const series = parseForwardEstimatesFromFmp('META', META_ANALYST_ROWS, {
      maxYears: 3,
      minForwardFiscalYear: 2027,
    })
    const charts = forwardEstimatesToGrowthCharts(series)
    expect(charts?.points).toHaveLength(3)
    expect(charts?.points[0]).toMatchObject({
      fiscalYear: 2027,
      label: 'FY2027',
      kind: 'estimate',
      revenueUsd: expect.any(Number),
      eps: expect.any(Number),
    })
  })

  it('buildForwardGrowthChartsFromPack merges 2 actual + 3 forward years', () => {
    const charts = buildForwardGrowthChartsFromPack('META', META_ANALYST_ROWS, META_INCOME_ACTUALS)
    expect(charts?.points.map((p) => ({ fy: p.fiscalYear, kind: p.kind }))).toEqual([
      { fy: 2024, kind: 'actual' },
      { fy: 2025, kind: 'actual' },
      { fy: 2027, kind: 'estimate' },
      { fy: 2028, kind: 'estimate' },
      { fy: 2029, kind: 'estimate' },
    ])
    expect(charts?.points[0]?.revenueUsd).toBeCloseTo(165e9, -6)
    expect(charts?.points[2]?.revenueUsd).toBeCloseTo(301.7e9, -6)
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
