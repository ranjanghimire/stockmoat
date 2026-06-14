import type { SupabaseClient } from '@supabase/supabase-js'
import type { ForwardGrowthCharts, ForwardGrowthChartPoint } from './parseForwardEstimates'

/** Three consecutive forward consensus revenue years from the growth chart (e.g. 2027–2029). */
export interface ForwardRevenueEstimateWindow {
  years: [number, number, number]
  revenuesUsd: [number, number, number]
}

const MIN_CAGR = -0.95
const MAX_CAGR = 5

/**
 * First three `estimate` chart points with revenue, in fiscal-year order.
 * Window rolls forward with the chart (e.g. 2028–2030 when in-progress year is 2027).
 */
export function extractForwardRevenueEstimateWindow(
  charts: ForwardGrowthCharts | null | undefined,
): ForwardRevenueEstimateWindow | undefined {
  if (!charts?.points?.length) return undefined

  const estimates: ForwardGrowthChartPoint[] = charts.points
    .filter((p) => p.kind === 'estimate' && p.revenueUsd !== undefined && p.revenueUsd > 0)
    .sort((a, b) => a.fiscalYear - b.fiscalYear)

  if (estimates.length < 3) return undefined

  const trio = estimates.slice(0, 3)
  const y0 = trio[0]!.fiscalYear
  if (trio[1]!.fiscalYear !== y0 + 1 || trio[2]!.fiscalYear !== y0 + 2) return undefined

  return {
    years: [y0, y0 + 1, y0 + 2],
    revenuesUsd: [trio[0]!.revenueUsd!, trio[1]!.revenueUsd!, trio[2]!.revenueUsd!],
  }
}

/** 2-year CAGR across the three-year revenue window (first year → third year). */
export function forwardRevenueCagrFromWindow(window: ForwardRevenueEstimateWindow): number | undefined {
  const [r1, , r3] = window.revenuesUsd
  if (!Number.isFinite(r1) || !Number.isFinite(r3) || r1 <= 0 || r3 <= 0) return undefined
  const cagr = Math.pow(r3 / r1, 0.5) - 1
  if (!Number.isFinite(cagr) || cagr < MIN_CAGR || cagr > MAX_CAGR) return undefined
  return cagr
}

export function forwardRevenueCagrFromCharts(
  charts: ForwardGrowthCharts | null | undefined,
): number | undefined {
  const window = extractForwardRevenueEstimateWindow(charts)
  if (!window) return undefined
  return forwardRevenueCagrFromWindow(window)
}

/** Strictly increasing revenue across the three forward estimate years (R1 < R2 < R3). */
export function isForwardRevenueMonotonic(charts: ForwardGrowthCharts | null | undefined): boolean {
  const window = extractForwardRevenueEstimateWindow(charts)
  if (!window) return false
  const [r1, r2, r3] = window.revenuesUsd
  return r1 < r2 && r2 < r3
}

/**
 * Map raw CAGR values to 1–10 via percentile ranks across the screener universe.
 * Equal CAGR → equal score. Highest CAGR → 10.
 */
const UNIVERSE_CACHE_MS = 5 * 60 * 1000
let universeCache: { savedAt: number; entries: Array<{ symbol: string; cagr: number }> } | null = null

/** Paginated CAGR rows from `screen_scores` for percentile ranking. */
export async function fetchForwardGrowthCagrUniverse(
  supabase: SupabaseClient,
): Promise<Array<{ symbol: string; cagr: number }>> {
  if (universeCache && Date.now() - universeCache.savedAt < UNIVERSE_CACHE_MS) {
    return universeCache.entries
  }

  const entries: Array<{ symbol: string; cagr: number }> = []
  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('screen_scores')
      .select('symbol, forward_rev_cagr_3y')
      .not('forward_rev_cagr_3y', 'is', null)
      .range(from, from + pageSize - 1)
    if (error) throw new Error(error.message)
    const batch = data ?? []
    for (const row of batch) {
      const sym = typeof row.symbol === 'string' ? row.symbol.trim().toUpperCase() : ''
      const cagr = row.forward_rev_cagr_3y
      if (sym && typeof cagr === 'number' && Number.isFinite(cagr)) {
        entries.push({ symbol: sym, cagr })
      }
    }
    if (batch.length < pageSize) break
  }

  universeCache = { savedAt: Date.now(), entries }
  return entries
}

export function clearForwardGrowthCagrUniverseCache(): void {
  universeCache = null
}

/**
 * 1–10 rank for a symbol from live charts vs screener CAGR universe (works even if symbol not in screen_scores yet).
 */
export function forwardGrowthScoreFromCharts(
  symbol: string,
  charts: ForwardGrowthCharts | null | undefined,
  universe: ReadonlyArray<{ symbol: string; cagr: number }>,
): number | null {
  const cagr = forwardRevenueCagrFromCharts(charts)
  if (cagr === undefined) return null
  const sym = symbol.trim().toUpperCase()
  const merged = universe.filter((e) => e.symbol !== sym)
  merged.push({ symbol: sym, cagr })
  return percentileForwardGrowthScores(merged).get(sym) ?? null
}

export function percentileForwardGrowthScores(
  entries: ReadonlyArray<{ symbol: string; cagr: number }>,
): Map<string, number> {
  const scores = new Map<string, number>()
  if (entries.length === 0) return scores

  const sorted = [...entries].sort((a, b) => a.cagr - b.cagr)
  const n = sorted.length

  if (n === 1) {
    scores.set(sorted[0]!.symbol, 10)
    return scores
  }

  let i = 0
  while (i < n) {
    const cagr = sorted[i]!.cagr
    let j = i + 1
    while (j < n && sorted[j]!.cagr === cagr) j++
    const midRank = (i + j - 1) / 2
    const score = Math.min(10, Math.max(1, Math.ceil(((midRank + 1) / n) * 10)))
    for (let k = i; k < j; k++) scores.set(sorted[k]!.symbol, score)
    i = j
  }

  return scores
}
