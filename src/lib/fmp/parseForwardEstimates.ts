import { num, type JsonRecord } from './normalize'

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
}

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
    if (lastActual !== undefined && y <= lastActual) continue

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
