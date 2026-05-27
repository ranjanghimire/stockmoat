import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  buildForwardGrowthChartsFromPack,
  chartYearFromRow,
  detectInProgressChartYear,
  formatForwardEstimatesBlock,
  forwardGrowthChartsComplete,
  preferPackBuiltForwardGrowth,
  parseForwardEstimatesFromFmp,
  projectInProgressFiscalYearFromQuarters,
  resolveGrowthChartYears,
} from './parseForwardEstimates'

const META_ANALYST_ROWS = [
  { date: '2029-12-31', calendarYear: 2029, estimatedRevenueAvg: 400_000_000_000, estimatedEpsAvg: 45 },
  { date: '2028-12-31', calendarYear: 2028, estimatedRevenueAvg: 352_680_000_000, estimatedEpsAvg: 40.92 },
  { date: '2027-12-31', calendarYear: 2027, estimatedRevenueAvg: 301_700_000_000, estimatedEpsAvg: 36.01 },
  { date: '2026-12-31', calendarYear: 2026, estimatedRevenueAvg: 253_080_000_000, estimatedEpsAvg: 32.32 },
  { date: '2025-12-31', calendarYear: 2025, estimatedRevenueAvg: 200_970_000_000, estimatedEpsAvg: 23.49 },
]

const META_INCOME_ANNUAL = [{ calendarYear: 2025, revenue: 201_000_000_000, epsdiluted: 23.5 }]

const META_INCOME_Q_2026 = [
  { calendarYear: 2026, period: 'Q1', date: '2026-03-31', revenue: 40_000_000_000, epsdiluted: 4 },
  { calendarYear: 2026, period: 'Q2', date: '2026-06-30', revenue: 42_000_000_000, epsdiluted: 4.1 },
]

const META_ANALYST_Q_2026 = [
  { calendarYear: 2026, period: 'Q2', date: '2026-06-30', estimatedRevenueAvg: 41_000_000_000, estimatedEpsAvg: 4.1 },
  { calendarYear: 2026, period: 'Q3', date: '2026-09-30', estimatedRevenueAvg: 45_000_000_000, estimatedEpsAvg: 4.5 },
  { calendarYear: 2026, period: 'Q4', date: '2026-12-31', estimatedRevenueAvg: 48_000_000_000, estimatedEpsAvg: 4.8 },
]

const NVDA_Q1 = {
  fiscalYear: 2027,
  calendarYear: 2026,
  period: 'Q1',
  date: '2026-04-30',
  revenue: 44_000_000_000,
  epsdiluted: 2.4,
}

const NVDA_Q_EST_2026 = [
  { calendarYear: 2026, period: 'Q2', estimatedEpsAvg: 2.5 },
  { calendarYear: 2026, period: 'Q3', estimatedEpsAvg: 3 },
  { calendarYear: 2026, period: 'Q4', estimatedEpsAvg: 3.5 },
]

describe('parseForwardEstimatesFromFmp', () => {
  it('chartYearFromRow prefers calendar year over fiscal label', () => {
    expect(chartYearFromRow(NVDA_Q1)).toBe(2026)
    expect(NVDA_Q1.fiscalYear).toBe(2027)
  })

  it('detectInProgressChartYear finds partial calendar year', () => {
    expect(detectInProgressChartYear([NVDA_Q1])).toBe(2026)
    expect(resolveGrowthChartYears([{ calendarYear: 2025, revenue: 1 }, { calendarYear: 2026, revenue: 2 }], [NVDA_Q1])).toEqual({
      completed: 2025,
      inProgress: 2026,
    })
  })

  it('resolveGrowthChartYears uses calendar anchor when quarters exist for current year', () => {
    const cy = new Date().getUTCFullYear()
    const quarters = [
      { calendarYear: cy, period: 'Q1', date: `${cy}-03-31`, revenue: 1 },
      { calendarYear: cy, period: 'Q2', date: `${cy}-06-30`, revenue: 2 },
    ]
    const years = resolveGrowthChartYears([{ calendarYear: cy, revenue: 99 }], quarters)
    expect(years).toEqual({ completed: cy - 1, inProgress: cy })
  })

  it('projectInProgressFiscalYearFromQuarters sums four quarters (NVDA-style)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-26T12:00:00Z'))
    const projected = projectInProgressFiscalYearFromQuarters(2026, [NVDA_Q1], NVDA_Q_EST_2026)
    expect(projected?.eps).toBeCloseTo(11.4, 2)
    expect(projected?.projectionNote).toContain('1 reported')
    expect(projected?.projectionNote).toContain('3 est.')
    vi.useRealTimers()
  })

  it('buckets income quarters by period-end calendar year, not fiscal label alone', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-26T12:00:00Z'))
    const income = [
      { fiscalYear: '2027', period: 'Q1', date: '2026-04-26', revenue: 80, epsdiluted: 2.4 },
      { fiscalYear: '2026', period: 'Q4', date: '2026-01-25', revenue: 68, epsdiluted: 2.0 },
      { fiscalYear: '2026', period: 'Q3', date: '2025-10-26', revenue: 57, epsdiluted: 1.5 },
      { fiscalYear: '2026', period: 'Q2', date: '2025-07-27', revenue: 46, epsdiluted: 1.2 },
    ]
    const projected = projectInProgressFiscalYearFromQuarters(2026, income, [], [])
    expect(projected?.projectionNote).not.toContain('4 reported')
    expect(projected?.projectionNote).toContain('2 reported')
    vi.useRealTimers()
  })

  it('ignores income rows for quarters that have not ended yet', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-26T12:00:00Z'))
    const income = [
      { calendarYear: 2026, period: 'Q1', date: '2026-03-31', revenue: 10, epsdiluted: 1 },
      { calendarYear: 2026, period: 'Q2', date: '2026-06-30', revenue: 99, epsdiluted: 9 },
    ]
    const projected = projectInProgressFiscalYearFromQuarters(2026, income, META_ANALYST_Q_2026)
    expect(projected?.projectionNote).toContain('1 reported')
    expect(projected?.projectionNote).not.toContain('4 reported')
    vi.useRealTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('preferPackBuiltForwardGrowth uses complete pack over stale cache', () => {
    const stale = buildForwardGrowthChartsFromPack('META', [], META_INCOME_ANNUAL, [], [])
    const full = buildForwardGrowthChartsFromPack(
      'META',
      META_ANALYST_ROWS,
      META_INCOME_ANNUAL,
      META_INCOME_Q_2026,
      META_ANALYST_Q_2026,
    )
    expect(forwardGrowthChartsComplete(stale)).toBe(false)
    expect(forwardGrowthChartsComplete(full)).toBe(true)
    expect(preferPackBuiltForwardGrowth(stale, full)).toBe(full)
  })

  it('buildForwardGrowthChartsFromPack shows 2025–2029', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-26T12:00:00Z'))
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
    expect(charts?.points[1]?.eps).toBeCloseTo(17.4, 1)
    expect(charts?.points[1]?.projectionNote).toContain('1 reported')
    vi.useRealTimers()
  })

  it('minForwardFiscalYear keeps 2027–2029 when last actual is 2025', () => {
    const series = parseForwardEstimatesFromFmp('META', META_ANALYST_ROWS, {
      maxYears: 3,
      minForwardFiscalYear: 2027,
    })
    expect(series.revenue.map((p) => p.fiscalYear)).toEqual([2027, 2028, 2029])
  })

  it('formats forward block', () => {
    const series = parseForwardEstimatesFromFmp('META', META_ANALYST_ROWS, {
      maxYears: 3,
      lastActualFiscalYear: 2025,
    })
    const block = formatForwardEstimatesBlock('META', series)
    expect(block).toContain('FY2026: $253.08B')
  })
})
