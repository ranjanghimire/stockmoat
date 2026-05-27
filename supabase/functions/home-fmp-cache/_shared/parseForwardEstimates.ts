import type { JsonRecord } from './normalize.ts'
import { num } from './normalize.ts'

export interface ForwardEstimatePoint {
  fiscalYear: number
  revenueUsd?: number
  eps?: number
  revenueAnalystCount?: number
  epsAnalystCount?: number
}

export type ForwardEstimatesSource = 'fmp' | 'gemini'

export interface ForwardEstimatesSeries {
  symbol: string
  source: ForwardEstimatesSource
  /** ISO date from newest estimate row when present */
  asOf?: string
  revenue: ForwardEstimatePoint[]
  eps: ForwardEstimatePoint[]
}

function pick(row: JsonRecord, keys: string[]): number | undefined {
  for (const k of keys) {
    const v = num(row[k])
    if (v !== undefined) return v
  }
  return undefined
}

function fiscalYearFromRow(row: JsonRecord): number | undefined {
  let y = pick(row, ['calendarYear', 'fiscalYear', 'year'])
  if (y !== undefined) return Math.round(y)
  const d = row.date
  if (typeof d === 'string' && d.length >= 4) {
    const parsed = new Date(d.slice(0, 10))
    if (!Number.isNaN(parsed.getTime())) return parsed.getUTCFullYear()
    const n = Number(d.slice(0, 4))
    if (Number.isFinite(n)) return n
  }
  return undefined
}

function asOfFromRows(rows: JsonRecord[]): string | undefined {
  let best: string | undefined
  for (const row of rows) {
    const d = row.date
    if (typeof d === 'string' && d.length >= 4) {
      if (!best || d > best) best = d.slice(0, 10)
    }
  }
  return best
}

/**
 * Last completed fiscal year from annual income (FMP list is newest-first).
 */
export function lastActualFiscalYearFromIncome(incomeAnnual: JsonRecord[]): number | undefined {
  const row = incomeAnnual[0]
  if (!row) return undefined
  let y = pick(row, ['calendarYear', 'fiscalYear'])
  if (y !== undefined) return Math.round(y)
  const d = row.date
  if (typeof d === 'string' && d.length >= 4) {
    const n = Number(d.slice(0, 4))
    if (Number.isFinite(n)) return n
  }
  return undefined
}

export interface ParseForwardEstimatesOptions {
  /** Keep at most this many forward fiscal years (default 3). */
  maxYears?: number
  /** If set, only years strictly after this are forward. */
  lastActualFiscalYear?: number
  /** If set, only years >= this are included (overrides lastActualFiscalYear cutoff). */
  minForwardFiscalYear?: number
}

/** Two reported fiscal years + three forward consensus years on the growth chart. */
export const FORWARD_GROWTH_HISTORICAL_YEARS = 2
export const FORWARD_GROWTH_FORWARD_YEARS = 3

/**
 * Parse FMP `/stable/analyst-estimates` rows into forward-only revenue + EPS series.
 * Omits years with no value for that metric (no guessing).
 */
export function parseForwardEstimatesFromFmp(
  symbol: string,
  analystRows: JsonRecord[],
  opts: ParseForwardEstimatesOptions = {},
): ForwardEstimatesSeries {
  const maxYears = opts.maxYears ?? 3
  const lastActual = opts.lastActualFiscalYear
  const minForward = opts.minForwardFiscalYear

  const byYear = new Map<
    number,
    {
      revenueUsd?: number
      eps?: number
      revenueAnalystCount?: number
      epsAnalystCount?: number
    }
  >()

  for (const row of analystRows) {
    const y = fiscalYearFromRow(row)
    if (y === undefined) continue
    if (minForward !== undefined) {
      if (y < minForward) continue
    } else if (lastActual !== undefined && y <= lastActual) {
      continue
    }

    const revenueUsd = pick(row, [
      'estimatedRevenueAvg',
      'revenueAvg',
      'estimatedRevenue',
      'revenueEstimate',
    ])
    const eps = pick(row, [
      'estimatedEpsAvg',
      'estimatedEarningsAvg',
      'epsAvg',
      'estimatedEps',
      'eps',
    ])
    const revenueAnalystCount = pick(row, [
      'numberAnalystEstimatedRevenue',
      'numberOfAnalystsEstimatedRevenue',
      'numAnalystsRevenue',
    ])
    const epsAnalystCount = pick(row, [
      'numberAnalystEstimatedEps',
      'numberAnalystsEstimatedEps',
      'numAnalystsEps',
    ])

    if (revenueUsd === undefined && eps === undefined) continue

    const cur = byYear.get(y) ?? {}
    if (revenueUsd !== undefined) cur.revenueUsd = revenueUsd
    if (eps !== undefined) cur.eps = eps
    if (revenueAnalystCount !== undefined) cur.revenueAnalystCount = revenueAnalystCount
    if (epsAnalystCount !== undefined) cur.epsAnalystCount = epsAnalystCount
    byYear.set(y, cur)
  }

  const years = [...byYear.keys()].sort((a, b) => a - b).slice(0, maxYears)

  const revenue: ForwardEstimatePoint[] = []
  const eps: ForwardEstimatePoint[] = []

  for (const fiscalYear of years) {
    const v = byYear.get(fiscalYear)!
    if (v.revenueUsd !== undefined) {
      revenue.push({
        fiscalYear,
        revenueUsd: v.revenueUsd,
        revenueAnalystCount: v.revenueAnalystCount,
      })
    }
    if (v.eps !== undefined) {
      eps.push({
        fiscalYear,
        eps: v.eps,
        epsAnalystCount: v.epsAnalystCount,
      })
    }
  }

  return {
    symbol: symbol.toUpperCase(),
    source: 'fmp',
    asOf: asOfFromRows(analystRows),
    revenue,
    eps,
  }
}

export function formatRevenueUsd(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(2)}T`
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  return `$${n.toFixed(0)}`
}

export type ForwardGrowthPointKind = 'actual' | 'estimate'

export interface ForwardGrowthChartPoint {
  fiscalYear: number
  label: string
  kind: ForwardGrowthPointKind
  revenueUsd?: number
  eps?: number
  revenueAnalystCount?: number
  epsAnalystCount?: number
}

export interface ForwardGrowthCharts {
  symbol: string
  points: ForwardGrowthChartPoint[]
  asOf?: string
}

/** Merge revenue + EPS series into aligned FY rows for charting. */
export function forwardEstimatesToGrowthCharts(series: ForwardEstimatesSeries): ForwardGrowthCharts | undefined {
  const years = new Set([
    ...series.revenue.map((p) => p.fiscalYear),
    ...series.eps.map((p) => p.fiscalYear),
  ])
  if (years.size === 0) return undefined

  const revByFy = new Map(series.revenue.map((p) => [p.fiscalYear, p]))
  const epsByFy = new Map(series.eps.map((p) => [p.fiscalYear, p]))

  const points: ForwardGrowthChartPoint[] = [...years]
    .sort((a, b) => a - b)
    .map((fiscalYear) => {
      const r = revByFy.get(fiscalYear)
      const e = epsByFy.get(fiscalYear)
      return {
        fiscalYear,
        label: `FY${fiscalYear}`,
        kind: 'estimate' as const,
        revenueUsd: r?.revenueUsd,
        eps: e?.eps,
        revenueAnalystCount: r?.revenueAnalystCount,
        epsAnalystCount: e?.epsAnalystCount,
      }
    })

  return { symbol: series.symbol, points, asOf: series.asOf }
}

function pickNetIncomeFromIncome(row: JsonRecord): number | undefined {
  return (
    num(row.netIncome) ??
    num(row.netIncomeApplicableToCommonShares) ??
    num(row.netIncomeCommonStockholders) ??
    num(row.netIncomeLoss)
  )
}

/** Reported annual revenue / EPS for specific fiscal years (from income statement). */
export function parseActualsFromIncome(
  incomeAnnual: JsonRecord[],
  fiscalYears: number[],
): Map<number, { revenueUsd?: number; eps?: number }> {
  const want = new Set(fiscalYears)
  const out = new Map<number, { revenueUsd?: number; eps?: number }>()

  for (const row of incomeAnnual) {
    const y = fiscalYearFromRow(row)
    if (y === undefined || !want.has(y)) continue

    const revenueUsd = pick(row, ['revenue', 'totalRevenue', 'revenueUSD'])
    const eps = pick(row, ['epsdiluted', 'epsDiluted', 'eps'])

    if (revenueUsd === undefined && eps === undefined) continue

    const cur = out.get(y) ?? {}
    if (revenueUsd !== undefined) cur.revenueUsd = revenueUsd
    if (eps !== undefined) cur.eps = eps
    out.set(y, cur)
  }

  return out
}

function mergeActualAndForwardCharts(
  symbol: string,
  histYears: number[],
  actuals: Map<number, { revenueUsd?: number; eps?: number }>,
  series: ForwardEstimatesSeries,
): ForwardGrowthCharts | undefined {
  const forward = forwardEstimatesToGrowthCharts(series)
  const points: ForwardGrowthChartPoint[] = []

  for (const fy of histYears) {
    const a = actuals.get(fy)
    if (a?.revenueUsd === undefined && a?.eps === undefined) continue
    points.push({
      fiscalYear: fy,
      label: `FY${fy}`,
      kind: 'actual',
      revenueUsd: a?.revenueUsd,
      eps: a?.eps,
    })
  }

  if (forward?.points) {
    for (const p of forward.points) {
      points.push(p)
    }
  }

  if (points.length === 0) return undefined
  return { symbol: symbol.toUpperCase(), points, asOf: series.asOf }
}

export function forwardGrowthChartsUsable(charts: ForwardGrowthCharts | null | undefined): boolean {
  return !!charts?.points?.some((p) => p.revenueUsd !== undefined || p.eps !== undefined)
}

export function buildForwardGrowthChartsFromPack(
  symbol: string,
  analystRows: JsonRecord[],
  incomeAnnual: JsonRecord[],
): ForwardGrowthCharts | undefined {
  const lastActual = lastActualFiscalYearFromIncome(incomeAnnual)

  if (lastActual === undefined) {
    const series = parseForwardEstimatesFromFmp(symbol, analystRows, { maxYears: FORWARD_GROWTH_FORWARD_YEARS })
    return forwardEstimatesToGrowthCharts(series)
  }

  const histYears = Array.from(
    { length: FORWARD_GROWTH_HISTORICAL_YEARS },
    (_, i) => lastActual - (FORWARD_GROWTH_HISTORICAL_YEARS - 1 - i),
  )
  const minForward = lastActual + 2

  const actuals = parseActualsFromIncome(incomeAnnual, histYears)
  const series = parseForwardEstimatesFromFmp(symbol, analystRows, {
    maxYears: FORWARD_GROWTH_FORWARD_YEARS,
    minForwardFiscalYear: minForward,
  })

  return mergeActualAndForwardCharts(symbol, histYears, actuals, series)
}

export function formatForwardEstimatesBlock(companyName: string, series: ForwardEstimatesSeries): string {
  const name = companyName.trim() || series.symbol
  const lines: string[] = [`For ${name}, the forward estimates are:`, '', 'Revenue:']
  for (const p of series.revenue) {
    lines.push(`- FY${p.fiscalYear}: ${formatRevenueUsd(p.revenueUsd!)}`)
  }
  lines.push('', 'EPS:')
  for (const p of series.eps) {
    lines.push(`- FY${p.fiscalYear}: $${p.eps!.toFixed(2)}`)
  }
  return lines.join('\n')
}
