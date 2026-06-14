import { describe, expect, it } from 'vitest'
import {
  activeScreenerFilterCount,
  EMPTY_SCREENER_FILTERS,
  screenerFilterClauses,
  screenerFiltersActive,
} from './screenerFilterTypes'

describe('screenerFilterClauses', () => {
  it('returns no clauses for empty filters', () => {
    expect(screenerFilterClauses(EMPTY_SCREENER_FILTERS)).toEqual([])
    expect(screenerFiltersActive(EMPTY_SCREENER_FILTERS)).toBe(false)
  })

  it('builds profile and sector clauses', () => {
    const clauses = screenerFilterClauses({
      ...EMPTY_SCREENER_FILTERS,
      profile: 'software_saas',
      sector: 'Technology',
    })
    expect(clauses).toContainEqual({ type: 'eq', column: 'profile_id', value: 'software_saas' })
    expect(clauses).toContainEqual({ type: 'eq', column: 'sector', value: 'Technology' })
  })

  it('builds empty sector or clause', () => {
    const clauses = screenerFilterClauses({
      ...EMPTY_SCREENER_FILTERS,
      sector: '__none__',
    })
    expect(clauses).toContainEqual({ type: 'or', expression: 'sector.is.null,sector.eq.' })
  })

  it('builds score and pillar gte clauses', () => {
    const clauses = screenerFilterClauses({
      ...EMPTY_SCREENER_FILTERS,
      minVms: 6,
      minValuation: 7,
      minBalanceSheet: 6.5,
    })
    expect(clauses).toContainEqual({ type: 'gte', column: 'score', value: 6 })
    expect(clauses).toContainEqual({ type: 'gte', column: 'valuation_score', value: 7 })
    expect(clauses).toContainEqual({ type: 'gte', column: 'balance_sheet_score', value: 6.5 })
  })

  it('builds ffv2 multiple with not-null guard', () => {
    const clauses = screenerFilterClauses({
      ...EMPTY_SCREENER_FILTERS,
      ffv2MultipleMin: 2,
    })
    expect(clauses).toContainEqual({ type: 'gte', column: 'ffv2_price_ratio', value: 2 })
    expect(clauses).toContainEqual({ type: 'not_null', column: 'ffv2_price_ratio' })
  })

  it('counts active filters', () => {
    expect(
      activeScreenerFilterCount({
        ...EMPTY_SCREENER_FILTERS,
        minVms: 7,
        ffv2MultipleMin: 3,
        forwardRevMonotonic: true,
      }),
    ).toBe(3)
  })
})
