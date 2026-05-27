import { describe, expect, it } from 'vitest'

import {
  buildForwardGrowthChartsFromPack,
  formatForwardEstimatesBlock,
  forwardEstimatesToGrowthCharts,
  lastActualFiscalYearFromIncome,
  lastCompletedFiscalYearFromIncome,
  parseForwardEstimatesFromFmp,
  projectInProgressFiscalYearFromQuarters,
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

const META_INCOME_ANNUAL = [{ calendarYear: 2025, revenue: 201_000_000_000, epsdiluted: 23.5 }]

const META_INCOME_Q_2026 = [
  { calendarYear: 2026, period: 'Q1', date: '2026-03-31', revenue: 40_000_000_000, epsdiluted: 4 },
  { calendarYear: 2026, period: 'Q2', date: '2026-06-30', revenue: 42_000_000_000, epsdiluted: 4.1 },
]

const META_ANALYST_Q_2026 = [
  { calendarYear: 2026, period: 'Q3', date: '2026-09-30', estimatedRevenueAvg: 45_000_000_000, estimatedEpsAvg: 4.5 },
  { calendarYear: 2026, period: 'Q4', date: '2026-12-31', estimatedRevenueAvg: 48_000_000_000, estimatedEpsAvg: 4.8 },
]

describe('parseForwardEstimatesFromFmp', () => {
  it('excludes years at or before last actual fiscal year', () => {
    const lastActual = lastActualFiscalYearFromIncome(META_INCOME_ANNUAL)
    expect(lastActual).toBe(2025)

    const series = parseForwardEstimatesFromFmp('META', META_ANALYST_ROWS, {
      maxYears: 3,
      lastActualFiscalYear: 2025,
    })

    expect(series.revenue.map((p) => p.fiscalYear)).toEqual([2026, 2027, 2028])
  })

  it('minForwardFiscalYear keeps 2027–2029 when last actual is 2025', () => {
    const series = parseForwardEstimatesFromFmp('META', META_ANALYST_ROWS, {
      maxYears: 3,
      minForwardFiscalYear: 2027,
    })
    expect(series.revenue.map((p) => p.fiscalYear)).toEqual([2027, 2028, 2029])
  })

  it('lastCompletedFiscalYearFromIncome skips in-progress top annual year', () => {
    const annual = [
      { calendarYear: 2026, revenue: 50e9 },
      { calendarYear: 2025, revenue: 201e9 },
    ]
    const quarterly = [{ calendarYear: 2026, period: 'Q1', revenue: 50e9 }]
    expect(lastActualFiscalYearFromIncome(annual)).toBe(2026)
    expect(lastCompletedFiscalYearFromIncome(annual, quarterly)).toBe(2025)
  })

  it('projectInProgressFiscalYearFromQuarters sums actual + estimate quarters', () => {
    const projected = projectInProgressFiscalYearFromQuarters(
      2026,
      META_INCOME_Q_2026,
      META_ANALYST_Q_2026,
    )
    expect(projected?.revenueUsd).toBeCloseTo(175_000_000_000, -6)
    expect(projected?.eps).toBeCloseTo(17.4, 1)
    expect(projected?.projectionNote).toContain('2 reported')
    expect(projected?.projectionNote).toContain('2 est.')
  })

  it('buildForwardGrowthChartsFromPack shows 2025, projected 2026, and 2027–2029', () => {
    const charts = buildForwardGrowthChartsFromPack(
      'META',
      META_ANALYST_ROWS,
      META_INCOME_ANNUAL,
      META_INCOME_Q_2026,
      META_ANALYST_Q_2026,
    )
    expect(charts?.points.map((p) => ({ fy: p.fiscalYear, kind: p.kind }))).toEqual([
      { fy: 2025, kind: 'actual' },
      { fy: 2026, kind: 'projected' },
      { fy: 2027, kind: 'estimate' },
      { fy: 2028, kind: 'estimate' },
      { fy: 2029, kind: 'estimate' },
    ])
    expect(charts?.points[1]?.revenueUsd).toBeCloseTo(175e9, -6)
  })

  it('formats block like the Gemini prompt example', () => {
    const series = parseForwardEstimatesFromFmp('META', META_ANALYST_ROWS, {
      maxYears: 3,
      lastActualFiscalYear: 2025,
    })
    const block = formatForwardEstimatesBlock('META', series)
    expect(block).toContain('FY2026: $253.08B')
  })

  it('builds aligned chart points for revenue and EPS', () => {
    const series = parseForwardEstimatesFromFmp('META', META_ANALYST_ROWS, {
      maxYears: 3,
      minForwardFiscalYear: 2027,
    })
    const charts = forwardEstimatesToGrowthCharts(series)
    expect(charts?.points[0]).toMatchObject({
      fiscalYear: 2027,
      kind: 'estimate',
    })
  })
})
