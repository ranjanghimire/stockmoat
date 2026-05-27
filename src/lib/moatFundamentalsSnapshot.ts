import type { CompanyFacts } from './fmp/buildCompanyFacts'
import type { PeerMedians } from './fmp/peerMedians'
import {
  buildForwardGrowthChartsFromPack,
  forwardGrowthChartsUsable,
  type ForwardGrowthCharts,
} from './fmp/parseForwardEstimates'
import { buildValuationSummary } from './metricInterpretation/buildInterpretation'
import type { ValuationSummary } from './metricInterpretation/types'
import type { CompanyRawPack } from './fmp/fetchCompanyRawPack'
import {
  analystRecommendationFromFmpPack,
  type AnalystRecommendationSnapshot,
} from './fmp/parseAnalystStockRecommendations'
import type { JsonRecord } from './fmp/normalize'
import { num } from './fmp/normalize'

/** Shared axis label for income / balance statement rows (FMP or Yahoo-shaped). */
export function periodLabelFromStatementRow(row: JsonRecord): string {
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
  } else if (date.length >= 7 && !period) {
    label = date.slice(0, 7)
  }
  if (!label.trim()) label = date.slice(0, 4)
  return label
}

export function statementSortDate(row: JsonRecord): string {
  const dateRaw = row.date
  return typeof dateRaw === 'string' && dateRaw.length >= 4 ? dateRaw.slice(0, 10) : '0000-01-01'
}

/** One period for EPS / revenue / net income bar charts (FMP or Yahoo-shaped income rows). */
export interface IncomeChartPoint {
  date: string
  label: string
  revenue: number
  netIncome: number
  eps?: number
}

export interface IncomeFundamentalsCharts {
  yearly: IncomeChartPoint[]
  quarterly: IncomeChartPoint[]
}

export interface BalanceChartPoint {
  date: string
  label: string
  totalAssets: number
  totalLiabilities: number
}

export interface BalanceFundamentalsCharts {
  yearly: BalanceChartPoint[]
  quarterly: BalanceChartPoint[]
}

export type MarketCapTierLabel = 'Large cap' | 'Mid cap' | 'Small cap'

/** Rough US-style breakpoints (quote-based market cap). */
export function marketCapTierLabel(usd: number): MarketCapTierLabel {
  if (!Number.isFinite(usd) || usd <= 0) return 'Small cap'
  if (usd >= 10e9) return 'Large cap'
  if (usd >= 2e9) return 'Mid cap'
  return 'Small cap'
}

/** Dividend yield as decimal (e.g. 0.025); display ×100 for percent. */
export function formatDividendYieldDecimal(d: number): string {
  const frac = d > 1.25 && d <= 100 ? d / 100 : d
  if (!Number.isFinite(frac)) return '—'
  return `${(frac * 100).toFixed(2)}%`
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
  ocfToNetIncome?: number
  fcfYield?: number
  /** Quote / profile market cap (USD). */
  marketCapUsd?: number
  marketCapTierLabel?: MarketCapTierLabel
  /** TTM dividend yield as decimal when available. */
  dividendYield?: number
  /** Latest row from FMP analyst stock recommendations (buy/hold/sell counts). */
  analystRecommendations?: AnalystRecommendationSnapshot
  incomeCharts?: IncomeFundamentalsCharts
  balanceCharts?: BalanceFundamentalsCharts
  /** Headline valuation multiples with meters (P/E, PEG, EV multiples). */
  valuation?: ValuationSummary
  /** Analyst consensus revenue / EPS for upcoming fiscal years (FMP only). */
  forwardGrowth?: ForwardGrowthCharts
}

function pickNetIncome(row: JsonRecord): number | undefined {
  return (
    num(row.netIncome) ??
    num(row.netIncomeApplicableToCommonShares) ??
    num(row.netIncomeCommonStockholders) ??
    num(row.netIncomeLoss)
  )
}

function rowToIncomeChartPoint(row: JsonRecord): IncomeChartPoint | null {
  const revenue = num(row.revenue)
  const netIncome = pickNetIncome(row)
  const eps = num(row.epsdiluted) ?? num(row.eps) ?? undefined
  if (revenue === undefined && netIncome === undefined && eps === undefined) return null

  return {
    date: statementSortDate(row),
    label: periodLabelFromStatementRow(row),
    revenue: revenue ?? 0,
    netIncome: netIncome ?? 0,
    eps,
  }
}

function buildSortedIncomePoints(rows: JsonRecord[]): IncomeChartPoint[] {
  const pts: IncomeChartPoint[] = []
  for (const row of rows) {
    const p = rowToIncomeChartPoint(row)
    if (p) pts.push(p)
  }
  pts.sort((a, b) => a.date.localeCompare(b.date))
  return pts
}

function buildIncomeChartsFromPack(pack: CompanyRawPack): IncomeFundamentalsCharts | undefined {
  const yearly = buildSortedIncomePoints(pack.incomeAnnual ?? [])
  const quarterly = buildSortedIncomePoints(pack.incomeQuarterly ?? [])
  if (yearly.length === 0 && quarterly.length === 0) return undefined
  return { yearly, quarterly }
}

function pickLiabilities(row: JsonRecord): number | undefined {
  const direct = num(row.totalLiabilities)
  if (direct !== undefined) return direct
  const assets = num(row.totalAssets)
  const eq = num(row.totalEquity, row.totalStockholdersEquity)
  if (assets !== undefined && eq !== undefined) return assets - eq
  return undefined
}

function rowToBalanceChartPoint(row: JsonRecord): BalanceChartPoint | null {
  const totalAssets = num(row.totalAssets)
  const totalLiabilities = pickLiabilities(row)
  if (totalAssets === undefined && totalLiabilities === undefined) return null
  return {
    date: statementSortDate(row),
    label: periodLabelFromStatementRow(row),
    totalAssets: totalAssets ?? 0,
    totalLiabilities: totalLiabilities ?? 0,
  }
}

function buildSortedBalancePoints(rows: JsonRecord[]): BalanceChartPoint[] {
  const pts: BalanceChartPoint[] = []
  for (const row of rows) {
    const p = rowToBalanceChartPoint(row)
    if (p) pts.push(p)
  }
  pts.sort((a, b) => a.date.localeCompare(b.date))
  return pts
}

function buildBalanceChartsFromPack(pack: CompanyRawPack): BalanceFundamentalsCharts | undefined {
  const yearly = buildSortedBalancePoints(pack.balanceSheetAnnual ?? [])
  const quarterly = buildSortedBalancePoints(pack.balanceSheetQuarterly ?? [])
  if (yearly.length === 0 && quarterly.length === 0) return undefined
  return { yearly, quarterly }
}

export function buildMoatFundamentalsSnapshot(
  f: CompanyFacts,
  pack?: CompanyRawPack,
  peers?: PeerMedians | null,
  sector?: string,
  /** Precomputed forward charts from Postgres (home-fmp-cache); falls back to pack analyst rows. */
  forwardGrowthFromCache?: ForwardGrowthCharts,
): MoatFundamentalsSnapshot {
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

  if (f.mktCap !== undefined && Number.isFinite(f.mktCap) && f.mktCap > 0) {
    base.marketCapUsd = f.mktCap
    base.marketCapTierLabel = marketCapTierLabel(f.mktCap)
  }
  if (f.dividendYield !== undefined && Number.isFinite(f.dividendYield)) {
    base.dividendYield = f.dividendYield
  }

  const valuation = buildValuationSummary(f, peers ?? null, sector ?? f.sector)
  if (valuation.lines.length > 0) base.valuation = valuation

  if (pack) {
    const incomeCharts = buildIncomeChartsFromPack(pack)
    if (incomeCharts) base.incomeCharts = incomeCharts
    const balanceCharts = buildBalanceChartsFromPack(pack)
    if (balanceCharts) base.balanceCharts = balanceCharts
    const ar = analystRecommendationFromFmpPack(pack)
    if (ar) base.analystRecommendations = ar

    if (forwardGrowthChartsUsable(forwardGrowthFromCache)) {
      base.forwardGrowth = forwardGrowthFromCache
    } else {
      const forwardGrowth = buildForwardGrowthChartsFromPack(
        f.symbol,
        pack.analystEstimates,
        pack.incomeAnnual,
        pack.incomeQuarterly,
        pack.analystEstimatesQuarterly ?? [],
      )
      if (forwardGrowthChartsUsable(forwardGrowth)) base.forwardGrowth = forwardGrowth
    }
  }
  return base
}
