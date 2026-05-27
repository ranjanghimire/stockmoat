import type { CompanyRawPack } from '../fmp/fetchCompanyRawPack'
import { fmpGet } from '../fmp/http'
import {
  buildForwardGrowthChartsFromPack,
  lastActualFiscalYearFromIncome,
  parseForwardEstimatesFromFmp,
  type ForwardEstimatesSeries,
  type ForwardGrowthCharts,
} from '../fmp/parseForwardEstimates'
import { asArray, type JsonRecord } from '../fmp/normalize'

export interface ResolveForwardEstimatesOptions {
  fmpApiKey: string
  /** Override FMP limit when refetching sparse pack rows (default 10). */
  estimateLimit?: number
  signal?: AbortSignal
}

export interface ResolvedForwardEstimates {
  series: ForwardEstimatesSeries
  charts?: ForwardGrowthCharts
}

function seriesHasData(s: ForwardEstimatesSeries): boolean {
  return s.revenue.length > 0 || s.eps.length > 0
}

/**
 * FMP-only forward analyst estimates (no Gemini). Refetches estimates when the pack has few rows.
 */
export async function resolveForwardEstimates(
  symbol: string,
  pack: CompanyRawPack,
  opts: ResolveForwardEstimatesOptions,
): Promise<ResolvedForwardEstimates | null> {
  const sym = symbol.toUpperCase()
  const lastActual = lastActualFiscalYearFromIncome(pack.incomeAnnual)
  const limit = opts.estimateLimit ?? 10

  let analystRows = pack.analystEstimates
  if (analystRows.length < 3) {
    try {
      const raw = await fmpGet<unknown>(
        `/stable/analyst-estimates?symbol=${encodeURIComponent(sym)}&period=annual&limit=${limit}`,
        opts.fmpApiKey,
        { signal: opts.signal },
      )
      analystRows = asArray<JsonRecord>(raw)
    } catch {
      /* use pack rows */
    }
  }

  const series = parseForwardEstimatesFromFmp(sym, analystRows, {
    maxYears: 3,
    lastActualFiscalYear: lastActual,
  })

  if (!seriesHasData(series)) return null

  const charts = buildForwardGrowthChartsFromPack(sym, analystRows, pack.incomeAnnual)
  return { series, charts: charts ?? undefined }
}
