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
 * Newest fiscal year on the annual income list (FMP list is newest-first).
 */
export function lastActualFiscalYearFromIncome(incomeAnnual: JsonRecord[]): number | undefined {
  const row = incomeAnnual[0]
  if (!row) return undefined
  const y = fiscalYearFromRow(row)
  return y !== undefined ? Math.round(y) : undefined
}

/**
 * Last fully reported fiscal year. If the newest annual row is an in-progress year
 * (< 4 reported quarters), uses the prior annual row instead.
 */
export function lastCompletedFiscalYearFromIncome(
  incomeAnnual: JsonRecord[],
  incomeQuarterly: JsonRecord[] = [],
): number | undefined {
  const newestFy = lastActualFiscalYearFromIncome(incomeAnnual)
  if (newestFy === undefined) return undefined

  const reportedQuarters = quarterlyMetricMapsForYear(incomeQuarterly, newestFy, 'actual').size
  if (reportedQuarters >= 4) return newestFy

  const priorRow = incomeAnnual[1]
  const priorFy = priorRow ? fiscalYearFromRow(priorRow) : undefined
  if (priorFy !== undefined && priorFy < newestFy) return Math.round(priorFy)

  return newestFy
}

export interface ParseForwardEstimatesOptions {
  /** Keep at most this many forward fiscal years (default 3). */
  maxYears?: number
  /** If set, only years strictly after this are forward. */
  lastActualFiscalYear?: number
  /** If set, only years >= this are included (overrides lastActualFiscalYear cutoff). */
  minForwardFiscalYear?: number
}

/** Last completed FY (annual actual) + in-progress FY + three forward consensus years. */
export const FORWARD_GROWTH_FORWARD_YEARS = 3

const QUARTER_ORDER = ['Q1', 'Q2', 'Q3', 'Q4'] as const

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

export type ForwardGrowthPointKind = 'actual' | 'projected' | 'estimate'

export interface ForwardGrowthChartPoint {
  fiscalYear: number
  label: string
  kind: ForwardGrowthPointKind
  revenueUsd?: number
  eps?: number
  revenueAnalystCount?: number
  epsAnalystCount?: number
  /** e.g. "2 reported + 2 est. quarters" for in-progress fiscal years */
  projectionNote?: string
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

function normalizeQuarterPeriod(row: JsonRecord): string | undefined {
  const p = row.period
  if (typeof p === 'string') {
    const m = p.trim().toUpperCase().match(/^Q([1-4])$/)
    if (m) return `Q${m[1]}`
  }
  const d = row.date
  if (typeof d === 'string' && d.length >= 7) {
    const month = Number(d.slice(5, 7))
    if (month >= 1 && month <= 12) {
      return `Q${Math.ceil(month / 3)}`
    }
  }
  return undefined
}

function quarterlyMetricMapsForYear(
  rows: JsonRecord[],
  fiscalYear: number,
  kind: 'actual' | 'estimate',
): Map<string, { revenueUsd?: number; eps?: number }> {
  const out = new Map<string, { revenueUsd?: number; eps?: number }>()

  for (const row of rows) {
    const y = fiscalYearFromRow(row)
    const q = normalizeQuarterPeriod(row)
    if (y !== fiscalYear || !q) continue

    const revenueUsd =
      kind === 'actual'
        ? pick(row, ['revenue', 'totalRevenue', 'revenueUSD'])
        : pick(row, ['estimatedRevenueAvg', 'revenueAvg', 'estimatedRevenue', 'revenueEstimate'])
    const eps =
      kind === 'actual'
        ? pick(row, ['epsdiluted', 'epsDiluted', 'eps'])
        : pick(row, ['estimatedEpsAvg', 'estimatedEarningsAvg', 'epsAvg', 'estimatedEps', 'eps'])

    if (revenueUsd === undefined && eps === undefined) continue

    const cur = out.get(q) ?? {}
    if (revenueUsd !== undefined) cur.revenueUsd = revenueUsd
    if (eps !== undefined) cur.eps = eps
    out.set(q, cur)
  }

  return out
}

export interface ProjectedFiscalYearMetrics {
  revenueUsd?: number
  eps?: number
  projectionNote?: string
}

/**
 * Full-year projection for the in-progress fiscal year: sum reported quarters (income)
 * plus consensus for quarters not yet reported.
 */
export function projectInProgressFiscalYearFromQuarters(
  fiscalYear: number,
  incomeQuarterly: JsonRecord[],
  analystQuarterly: JsonRecord[],
): ProjectedFiscalYearMetrics | undefined {
  const actualByQ = quarterlyMetricMapsForYear(incomeQuarterly, fiscalYear, 'actual')
  const estByQ = quarterlyMetricMapsForYear(analystQuarterly, fiscalYear, 'estimate')

  let revenueUsd = 0
  let eps = 0
  let hasRevenue = false
  let hasEps = false
  let reportedQuarters = 0
  let estimatedQuarters = 0

  for (const q of QUARTER_ORDER) {
    const actual = actualByQ.get(q)
    const est = estByQ.get(q)

    if (actual?.revenueUsd !== undefined) {
      revenueUsd += actual.revenueUsd
      hasRevenue = true
      reportedQuarters += 1
    } else if (est?.revenueUsd !== undefined) {
      revenueUsd += est.revenueUsd
      hasRevenue = true
      estimatedQuarters += 1
    }

    if (actual?.eps !== undefined) {
      eps += actual.eps
      hasEps = true
    } else if (est?.eps !== undefined) {
      eps += est.eps
      hasEps = true
    }
  }

  if (!hasRevenue && !hasEps) return undefined

  const projectionNote =
    reportedQuarters > 0 && estimatedQuarters > 0
      ? `${reportedQuarters} reported + ${estimatedQuarters} est. quarters`
      : reportedQuarters > 0
        ? `${reportedQuarters} reported quarters`
        : estimatedQuarters > 0
          ? `${estimatedQuarters} est. quarters`
          : undefined

  return {
    revenueUsd: hasRevenue ? revenueUsd : undefined,
    eps: hasEps ? eps : undefined,
    projectionNote,
  }
}

function annualConsensusForYear(
  analystRows: JsonRecord[],
  fiscalYear: number,
): { revenueUsd?: number; eps?: number; revenueAnalystCount?: number; epsAnalystCount?: number } | undefined {
  for (const row of analystRows) {
    const y = fiscalYearFromRow(row)
    if (y !== fiscalYear) continue
    const revenueUsd = pick(row, ['estimatedRevenueAvg', 'revenueAvg', 'estimatedRevenue', 'revenueEstimate'])
    const eps = pick(row, ['estimatedEpsAvg', 'estimatedEarningsAvg', 'epsAvg', 'estimatedEps', 'eps'])
    if (revenueUsd === undefined && eps === undefined) continue
    return {
      revenueUsd,
      eps,
      revenueAnalystCount: pick(row, [
        'numberAnalystEstimatedRevenue',
        'numberOfAnalystsEstimatedRevenue',
        'numAnalystsRevenue',
      ]),
      epsAnalystCount: pick(row, ['numberAnalystEstimatedEps', 'numberAnalystsEstimatedEps', 'numAnalystsEps']),
    }
  }
  return undefined
}

function buildFiveYearGrowthCharts(
  symbol: string,
  lastActual: number,
  incomeAnnual: JsonRecord[],
  incomeQuarterly: JsonRecord[],
  analystRows: JsonRecord[],
  analystQuarterly: JsonRecord[],
): ForwardGrowthCharts | undefined {
  const completedYear = lastActual
  const inProgressYear = lastActual + 1
  const minForward = lastActual + 2

  const points: ForwardGrowthChartPoint[] = []

  const actuals = parseActualsFromIncome(incomeAnnual, [completedYear])
  const completed = actuals.get(completedYear)
  if (completed?.revenueUsd !== undefined || completed?.eps !== undefined) {
    points.push({
      fiscalYear: completedYear,
      label: `FY${completedYear}`,
      kind: 'actual',
      revenueUsd: completed.revenueUsd,
      eps: completed.eps,
    })
  }

  const projected = projectInProgressFiscalYearFromQuarters(
    inProgressYear,
    incomeQuarterly,
    analystQuarterly,
  )
  if (projected?.revenueUsd !== undefined || projected?.eps !== undefined) {
    points.push({
      fiscalYear: inProgressYear,
      label: `FY${inProgressYear}`,
      kind: 'projected',
      revenueUsd: projected.revenueUsd,
      eps: projected.eps,
      projectionNote: projected.projectionNote,
    })
  } else {
    const fallback = annualConsensusForYear(analystRows, inProgressYear)
    if (fallback?.revenueUsd !== undefined || fallback?.eps !== undefined) {
      points.push({
        fiscalYear: inProgressYear,
        label: `FY${inProgressYear}`,
        kind: 'estimate',
        revenueUsd: fallback.revenueUsd,
        eps: fallback.eps,
        revenueAnalystCount: fallback.revenueAnalystCount,
        epsAnalystCount: fallback.epsAnalystCount,
        projectionNote: 'Annual consensus (quarterly detail unavailable)',
      })
    }
  }

  const series = parseForwardEstimatesFromFmp(symbol, analystRows, {
    maxYears: FORWARD_GROWTH_FORWARD_YEARS,
    minForwardFiscalYear: minForward,
  })
  const forward = forwardEstimatesToGrowthCharts(series)
  if (forward?.points) {
    for (const p of forward.points) {
      points.push(p)
    }
  }

  if (points.length === 0) return undefined
  return { symbol: symbol.toUpperCase(), points, asOf: series.asOf ?? asOfFromRows(analystQuarterly) }
}

export function forwardGrowthChartsUsable(charts: ForwardGrowthCharts | null | undefined): boolean {
  return !!charts?.points?.some((p) => p.revenueUsd !== undefined || p.eps !== undefined)
}

export function buildForwardGrowthChartsFromPack(
  symbol: string,
  analystRows: JsonRecord[],
  incomeAnnual: JsonRecord[],
  incomeQuarterly: JsonRecord[] = [],
  analystQuarterly: JsonRecord[] = [],
): ForwardGrowthCharts | undefined {
  const lastActual = lastCompletedFiscalYearFromIncome(incomeAnnual, incomeQuarterly)

  if (lastActual === undefined) {
    const series = parseForwardEstimatesFromFmp(symbol, analystRows, { maxYears: FORWARD_GROWTH_FORWARD_YEARS })
    return forwardEstimatesToGrowthCharts(series)
  }

  return buildFiveYearGrowthCharts(
    symbol,
    lastActual,
    incomeAnnual,
    incomeQuarterly,
    analystRows,
    analystQuarterly,
  )
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
