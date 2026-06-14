export type ScreenerScoreFilterKey =
  | 'vms'
  | 'valuation'
  | 'quality'
  | 'balanceSheet'
  | 'cashTruth'
  | 'stability'

export const MARKET_CAP_STEPS = [
  { label: 'Any', value: null },
  { label: '$1B+', value: 1e9 },
  { label: '$10B+', value: 10e9 },
  { label: '$50B+', value: 50e9 },
  { label: '$100B+', value: 100e9 },
  { label: '$500B+', value: 500e9 },
] as const

export type Ffv2MultipleFilter = null | 2 | 3

export interface ScreenerFilters {
  profile: string
  sector: string
  minVms: number | null
  minValuation: number | null
  minQuality: number | null
  minBalanceSheet: number | null
  minCashTruth: number | null
  minStability: number | null
  minMarketCapUsd: number | null
  ffv2MultipleMin: Ffv2MultipleFilter
  forwardRevMonotonic: boolean
}

export const EMPTY_SCREENER_FILTERS: ScreenerFilters = {
  profile: '',
  sector: '',
  minVms: null,
  minValuation: null,
  minQuality: null,
  minBalanceSheet: null,
  minCashTruth: null,
  minStability: null,
  minMarketCapUsd: null,
  ffv2MultipleMin: null,
  forwardRevMonotonic: false,
}

export const SCORE_FILTER_DB_COLUMN = {
  vms: 'score',
  valuation: 'valuation_score',
  quality: 'quality_score',
  balanceSheet: 'balance_sheet_score',
  cashTruth: 'cash_truth_score',
  stability: 'stability_score',
} as const satisfies Record<ScreenerScoreFilterKey, string>

export function screenerFiltersActive(filters: ScreenerFilters): boolean {
  return activeScreenerFilterCount(filters) > 0
}

export function activeScreenerFilterCount(filters: ScreenerFilters): number {
  let count = 0
  if (filters.profile) count++
  if (filters.sector) count++
  if (filters.minVms != null) count++
  if (filters.minValuation != null) count++
  if (filters.minQuality != null) count++
  if (filters.minBalanceSheet != null) count++
  if (filters.minCashTruth != null) count++
  if (filters.minStability != null) count++
  if (filters.minMarketCapUsd != null) count++
  if (filters.ffv2MultipleMin != null) count++
  if (filters.forwardRevMonotonic) count++
  return count
}

/** Serializable filter clauses for testing without a Supabase client. */
export type ScreenerFilterClause =
  | { type: 'eq'; column: string; value: string | boolean }
  | { type: 'gte'; column: string; value: number }
  | { type: 'not_null'; column: string }
  | { type: 'or'; expression: string }

export function screenerFilterClauses(filters: ScreenerFilters): ScreenerFilterClause[] {
  const clauses: ScreenerFilterClause[] = []

  if (filters.profile) {
    clauses.push({ type: 'eq', column: 'profile_id', value: filters.profile })
  }
  if (filters.sector === '__none__') {
    clauses.push({ type: 'or', expression: 'sector.is.null,sector.eq.' })
  } else if (filters.sector) {
    clauses.push({ type: 'eq', column: 'sector', value: filters.sector })
  }
  if (filters.minVms != null) {
    clauses.push({ type: 'gte', column: 'score', value: filters.minVms })
  }
  if (filters.minValuation != null) {
    clauses.push({ type: 'gte', column: 'valuation_score', value: filters.minValuation })
  }
  if (filters.minQuality != null) {
    clauses.push({ type: 'gte', column: 'quality_score', value: filters.minQuality })
  }
  if (filters.minBalanceSheet != null) {
    clauses.push({ type: 'gte', column: 'balance_sheet_score', value: filters.minBalanceSheet })
  }
  if (filters.minCashTruth != null) {
    clauses.push({ type: 'gte', column: 'cash_truth_score', value: filters.minCashTruth })
  }
  if (filters.minStability != null) {
    clauses.push({ type: 'gte', column: 'stability_score', value: filters.minStability })
  }
  if (filters.minMarketCapUsd != null) {
    clauses.push({ type: 'gte', column: 'market_cap_usd', value: filters.minMarketCapUsd })
  }
  if (filters.ffv2MultipleMin != null) {
    clauses.push({ type: 'gte', column: 'ffv2_price_ratio', value: filters.ffv2MultipleMin })
    clauses.push({ type: 'not_null', column: 'ffv2_price_ratio' })
  }
  if (filters.forwardRevMonotonic) {
    clauses.push({ type: 'eq', column: 'forward_rev_monotonic_3y', value: true })
  }

  return clauses
}
