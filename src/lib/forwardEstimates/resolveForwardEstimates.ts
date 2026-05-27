import type { CompanyFacts } from '../fmp/buildCompanyFacts'
import type { CompanyRawPack } from '../fmp/fetchCompanyRawPack'
import { fmpGet } from '../fmp/http'
import {
  lastActualFiscalYearFromIncome,
  parseForwardEstimatesFromFmp,
  type ForwardEstimatesSeries,
} from '../fmp/parseForwardEstimates'
import { asArray, type JsonRecord } from '../fmp/normalize'
import { fetchGeminiForwardEstimates } from './fetchGeminiForwardEstimates'

export interface ResolveForwardEstimatesOptions {
  fmpApiKey: string
  geminiApiKey?: string
  geminiModel?: string
  /** Override FMP limit (starter plans cap statement limits; estimates may need more than 5). */
  estimateLimit?: number
  signal?: AbortSignal
}

export interface ResolvedForwardEstimates {
  series: ForwardEstimatesSeries
  /** Present when Gemini filled gaps or replaced empty FMP. */
  usedGeminiFallback: boolean
  fmpSeries?: ForwardEstimatesSeries
}

function seriesIsUsable(s: ForwardEstimatesSeries): boolean {
  return s.revenue.length >= 1 && s.eps.length >= 1
}

function mergeFmpWithGemini(fmp: ForwardEstimatesSeries, gemini: ForwardEstimatesSeries): ForwardEstimatesSeries {
  const revYears = new Set(fmp.revenue.map((p) => p.fiscalYear))
  const epsYears = new Set(fmp.eps.map((p) => p.fiscalYear))
  const revenue = [...fmp.revenue]
  const eps = [...fmp.eps]

  for (const p of gemini.revenue) {
    if (!revYears.has(p.fiscalYear) && p.revenueUsd !== undefined) {
      revenue.push(p)
      revYears.add(p.fiscalYear)
    }
  }
  for (const p of gemini.eps) {
    if (!epsYears.has(p.fiscalYear) && p.eps !== undefined) {
      eps.push(p)
      epsYears.add(p.fiscalYear)
    }
  }

  revenue.sort((a, b) => a.fiscalYear - b.fiscalYear)
  eps.sort((a, b) => a.fiscalYear - b.fiscalYear)

  return {
    symbol: fmp.symbol,
    source: 'fmp',
    asOf: fmp.asOf,
    revenue: revenue.slice(0, 3),
    eps: eps.slice(0, 3),
  }
}

export async function resolveForwardEstimates(
  symbol: string,
  pack: CompanyRawPack,
  facts: CompanyFacts,
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

  const fmpSeries = parseForwardEstimatesFromFmp(sym, analystRows, {
    maxYears: 3,
    lastActualFiscalYear: lastActual,
  })

  if (seriesIsUsable(fmpSeries)) {
    return { series: fmpSeries, usedGeminiFallback: false, fmpSeries }
  }

  const geminiKey = opts.geminiApiKey?.trim()
  if (!geminiKey) {
    if (fmpSeries.revenue.length > 0 || fmpSeries.eps.length > 0) {
      return { series: fmpSeries, usedGeminiFallback: false, fmpSeries }
    }
    return null
  }

  try {
    const geminiSeries = await fetchGeminiForwardEstimates(sym, facts.companyName, geminiKey, {
      model: opts.geminiModel,
      lastActualFiscalYear: lastActual,
      signal: opts.signal,
    })

    if (!seriesIsUsable(fmpSeries) && seriesIsUsable(geminiSeries)) {
      return { series: { ...geminiSeries, source: 'gemini' }, usedGeminiFallback: true, fmpSeries }
    }

    if (seriesIsUsable(fmpSeries) && seriesIsUsable(geminiSeries)) {
      return {
        series: mergeFmpWithGemini(fmpSeries, geminiSeries),
        usedGeminiFallback: true,
        fmpSeries,
      }
    }

    if (seriesIsUsable(geminiSeries)) {
      return { series: geminiSeries, usedGeminiFallback: true, fmpSeries }
    }
  } catch {
    if (fmpSeries.revenue.length > 0 || fmpSeries.eps.length > 0) {
      return { series: fmpSeries, usedGeminiFallback: false, fmpSeries }
    }
    return null
  }

  if (fmpSeries.revenue.length > 0 || fmpSeries.eps.length > 0) {
    return { series: fmpSeries, usedGeminiFallback: false, fmpSeries }
  }
  return null
}
