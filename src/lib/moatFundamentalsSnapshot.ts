import type { CompanyFacts } from './fmp/buildCompanyFacts'
import type { CompanyRawPack } from './fmp/fetchCompanyRawPack'
import type { JsonRecord } from './fmp/normalize'
import { num } from './fmp/normalize'

/** One period for EPS / revenue / net income bar charts (FMP or Yahoo-shaped income rows). */
export interface IncomeChartPoint {
  /** ISO date when present (for sort). */
  date: string
  /** Axis label, e.g. `2023` or `2024 Q2`. */
  label: string
  revenue: number
  netIncome: number
  eps?: number
}

export interface IncomeFundamentalsCharts {
  yearly: IncomeChartPoint[]
  quarterly: IncomeChartPoint[]
}

/** Dollar and ratio context attached to analysis for pillar drill-downs (esp. cash truth). */
export interface MoatFundamentalsSnapshot {
  revenueTtmUsd?: number
  netIncomeTtmUsd?: number
  operatingCashFlowTtmUsd?: number
  freeCashFlowTtmUsd?: number
  capexTtmUsd?: number
  cashAndEquivalentsUsd?: number
  totalDebtUsd?: number
  /** OCF ÷ NI when computable; same signal as `ocf_to_ni_ttm` metric. */
  ocfToNetIncome?: number
  fcfYield?: number
  /** Income statement history for UI charts (annual + quarterly). */
  incomeCharts?: IncomeFundamentalsCharts
}

function pickNetIncome(row: JsonRecord): number | undefined {
  return (
    num(row.netIncome) ??
    num(row.netIncomeApplicableToCommonShares) ??
    num(row.netIncomeCommonStockholders) ??
    num(row.netIncomeLoss)
  )
}

function rowToChartPoint(row: JsonRecord): IncomeChartPoint | null {
  const revenue = num(row.revenue)
  const netIncome = pickNetIncome(row)
  const eps = num(row.epsdiluted) ?? num(row.eps) ?? undefined
  if (revenue === undefined && netIncome === undefined && eps === undefined) return null

  const dateRaw = row.date
  const date = typeof dateRaw === 'string' && dateRaw.length >= 4 ? dateRaw.slice(0, 10) : '0000-01-01'
  const cy = row.calendarYear
  const period = typeof row.period === 'string' ? row.period.trim() : ''

  let label = date.slice(0, 4)
  if (cy !== undefined && cy !== null && String(cy).length > 0) {
    label = String(cy)
  }
  if (period && /^Q[1-4]$/i.test(period)) {
    const y = cy !== undefined && cy !== null ? String(cy) : date.slice(0, 4)
    label = `${y} ${period.toUpperCase()}`
  }

  return {
    date,
    label,
    revenue: revenue ?? 0,
    netIncome: netIncome ?? 0,
    eps,
  }
}

function buildSortedPoints(rows: JsonRecord[]): IncomeChartPoint[] {
  const pts: IncomeChartPoint[] = []
  for (const row of rows) {
    const p = rowToChartPoint(row)
    if (p) pts.push(p)
  }
  pts.sort((a, b) => a.date.localeCompare(b.date))
  return pts
}

function buildIncomeChartsFromPack(pack: CompanyRawPack): IncomeFundamentalsCharts | undefined {
  const yearly = buildSortedPoints(pack.incomeAnnual ?? [])
  const quarterly = buildSortedPoints(pack.incomeQuarterly ?? [])
  if (yearly.length === 0 && quarterly.length === 0) return undefined
  return { yearly, quarterly }
}

export function buildMoatFundamentalsSnapshot(f: CompanyFacts, pack?: CompanyRawPack): MoatFundamentalsSnapshot {
  const base: MoatFundamentalsSnapshot = {
    revenueTtmUsd: f.revenueTtmAbsolute,
    netIncomeTtmUsd: f.niTtmAbsolute,
    operatingCashFlowTtmUsd: f.ocfTtmAbsolute,
    freeCashFlowTtmUsd: f.fcfTtmAbsolute,
    capexTtmUsd: f.capexTtmAbsolute,
    cashAndEquivalentsUsd: f.cashAndEquivalents,
    totalDebtUsd: f.totalDebt,
    ocfToNetIncome: f.ocfToNetIncome,
    fcfYield: f.fcfYield,
  }
  if (pack) {
    const incomeCharts = buildIncomeChartsFromPack(pack)
    if (incomeCharts) base.incomeCharts = incomeCharts
  }
  return base
}
