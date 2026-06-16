export type ChartsSortColumn = 'score' | 'forward_growth_score' | 'next_earnings_date'

export interface ChartsSortState {
  column: ChartsSortColumn
  ascending: boolean
}

export const DEFAULT_CHARTS_SORT: ChartsSortState = {
  column: 'score',
  ascending: false,
}

export const CHARTS_SORT_LABELS: Record<ChartsSortColumn, string> = {
  score: 'Moat score',
  forward_growth_score: 'Fwd growth score',
  next_earnings_date: 'Earnings date',
}

export function chartsDbOrderColumn(column: ChartsSortColumn): string {
  return column
}

/** PostgREST null guards when sorting by columns that may be sparse. */
export function chartsSortNullGuardColumn(column: ChartsSortColumn): string | null {
  if (column === 'forward_growth_score') return 'forward_growth_score'
  if (column === 'next_earnings_date') return 'next_earnings_date'
  return null
}
