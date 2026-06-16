import { describe, expect, it } from 'vitest'
import {
  chartsDbOrderColumn,
  chartsSortNullGuardColumn,
  DEFAULT_CHARTS_SORT,
} from './chartsSortTypes'

describe('chartsSortTypes', () => {
  it('defaults to moat score descending', () => {
    expect(DEFAULT_CHARTS_SORT).toEqual({ column: 'score', ascending: false })
  })

  it('maps sort columns to db order columns', () => {
    expect(chartsDbOrderColumn('score')).toBe('score')
    expect(chartsDbOrderColumn('forward_growth_score')).toBe('forward_growth_score')
    expect(chartsDbOrderColumn('next_earnings_date')).toBe('next_earnings_date')
  })

  it('returns null guard columns for sparse sorts only', () => {
    expect(chartsSortNullGuardColumn('score')).toBeNull()
    expect(chartsSortNullGuardColumn('forward_growth_score')).toBe('forward_growth_score')
    expect(chartsSortNullGuardColumn('next_earnings_date')).toBe('next_earnings_date')
  })
})
