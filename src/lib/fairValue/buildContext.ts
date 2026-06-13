import type { CompanyFacts } from '../fmp/buildCompanyFacts'
import { num, type JsonRecord } from '../fmp/normalize'
import { resolveGrowthChartYears, type ForwardEstimatesSeries } from '../fmp/parseForwardEstimates'
import type {
  FairValueBuildContext,
  FairValueInput,
  ForwardYearMetrics,
  NormalizedOperatingMetrics,
} from './types'

function pick(row: JsonRecord | undefined, keys: string[]): number | undefined {
  if (!row) return undefined
  for (const k of keys) {
    const v = num(row[k])
    if (v !== undefined) return v
  }
  return undefined
}

export function extractShares(facts: CompanyFacts, incomeAnnual: JsonRecord[]): number | undefined {
  const row = incomeAnnual[0]
  return (
    pick(row, ['weightedAverageShsOutDil', 'weightedAverageShsOut']) ??
    (facts.mktCap !== undefined && facts.price !== undefined && facts.price > 0
      ? facts.mktCap / facts.price
      : undefined)
  )
}

export function extractEbitdaFromIncome(row: JsonRecord | undefined): number | undefined {
  if (!row) return undefined
  let ebitda = pick(row, ['ebitda', 'EBITDA'])
  if (ebitda !== undefined) return ebitda
  const oi = pick(row, ['operatingIncome', 'ebit', 'EBIT'])
  const da = pick(row, ['depreciationAndAmortization', 'reconciledDepreciation'])
  if (oi !== undefined && da !== undefined) return oi + da
  return undefined
}

export function extractEbitFromIncome(row: JsonRecord | undefined): number | undefined {
  return pick(row, ['ebit', 'EBIT', 'operatingIncome'])
}

export function extractGrossProfit(facts: CompanyFacts): number | undefined {
  const rev = facts.revenueTtmAbsolute
  if (rev === undefined) return undefined
  if (facts.grossMargin !== undefined) return rev * facts.grossMargin
  return undefined
}

export function buildBaseOperatingMetrics(
  facts: CompanyFacts,
  incomeAnnual: JsonRecord[],
): NormalizedOperatingMetrics | null {
  const revenueTtm = facts.revenueTtmAbsolute
  const shares = extractShares(facts, incomeAnnual)
  if (revenueTtm === undefined || revenueTtm <= 0 || shares === undefined || shares <= 0) {
    return null
  }

  const inc0 = incomeAnnual[0]
  const ebitdaTtm = extractEbitdaFromIncome(inc0)
  const ebitTtm = extractEbitFromIncome(inc0)
  const grossProfit = extractGrossProfit(facts)
  const fcfTtm = facts.fcfTtmAbsolute
  const epsTtm = facts.annualEps[0]

  const totalDebt = facts.totalDebt ?? 0
  const cash = facts.cashAndEquivalents ?? 0
  const netDebt = totalDebt - cash

  const grossMargin = grossProfit !== undefined && revenueTtm > 0 ? grossProfit / revenueTtm : facts.grossMargin
  const ebitdaMargin = ebitdaTtm !== undefined && revenueTtm > 0 ? ebitdaTtm / revenueTtm : undefined
  const ebitToEbitdaRatio =
    ebitTtm !== undefined && ebitdaTtm !== undefined && Math.abs(ebitdaTtm) > 1e-9
      ? ebitTtm / ebitdaTtm
      : undefined
  const fcfToRevenue =
    fcfTtm !== undefined && revenueTtm > 0 ? fcfTtm / revenueTtm : facts.fcfToRevenueTtm

  const bookValuePerShare =
    facts.totalEquity !== undefined && facts.totalEquity > 0 ? facts.totalEquity / shares : undefined
  let tangibleBookPerShare = bookValuePerShare
  if (facts.priceToTangibleBook !== undefined && facts.priceToTangibleBook > 0 && facts.price !== undefined) {
    tangibleBookPerShare = facts.price / facts.priceToTangibleBook
  }
  const ffoPerShare = facts.ffoPerShare

  return {
    revenueTtm,
    grossProfitTtm: grossProfit,
    ebitdaTtm,
    ebitTtm,
    fcfTtm,
    epsTtm,
    grossMargin,
    ebitdaMargin,
    ebitToEbitdaRatio,
    fcfToRevenue,
    bookValuePerShare,
    tangibleBookPerShare,
    ffoPerShare,
    netDebt,
    shares,
    enterpriseValue: facts.enterpriseValue,
  }
}

/** Equity-only path for financials when revenue is unavailable. */
export function buildEquityOperatingMetrics(
  facts: CompanyFacts,
  incomeAnnual: JsonRecord[],
): NormalizedOperatingMetrics | null {
  const shares = extractShares(facts, incomeAnnual)
  if (shares === undefined || shares <= 0) return null

  const equity = facts.totalEquity
  if (equity === undefined || equity <= 0) return null

  const bookValuePerShare = equity / shares
  let tangibleBookPerShare = bookValuePerShare
  if (facts.priceToTangibleBook !== undefined && facts.priceToTangibleBook > 0 && facts.price !== undefined) {
    tangibleBookPerShare = facts.price / facts.priceToTangibleBook
  }

  const totalDebt = facts.totalDebt ?? 0
  const cash = facts.cashAndEquivalents ?? 0

  return {
    revenueTtm: facts.revenueTtmAbsolute ?? 0,
    epsTtm: facts.annualEps[0],
    bookValuePerShare,
    tangibleBookPerShare,
    ffoPerShare: facts.ffoPerShare,
    netDebt: totalDebt - cash,
    shares,
    enterpriseValue: facts.enterpriseValue,
  }
}

export function resolveForwardYears(
  input: FairValueInput,
  estimates: ForwardEstimatesSeries | null,
): { fy1?: ForwardYearMetrics; fy2?: ForwardYearMetrics } {
  if (!estimates) return {}

  const chartYears = resolveGrowthChartYears(input.incomeAnnual, input.incomeQuarterly)
  const inProgress = chartYears?.inProgress

  const findYear = (y: number): ForwardYearMetrics | undefined => {
    const pt = estimates.eps.find((p) => p.fiscalYear === y)
    const revPt = estimates.revenue.find((p) => p.fiscalYear === y)
    if (!pt && !revPt) return undefined
    return {
      fiscalYear: y,
      eps: pt?.eps,
      revenueUsd: revPt?.revenueUsd ?? pt?.revenueUsd,
      epsAnalystCount: pt?.epsAnalystCount,
      revenueAnalystCount: revPt?.revenueAnalystCount,
    }
  }

  if (inProgress !== undefined) {
    const fy1 = findYear(inProgress + 1)
    const fy2 = findYear(inProgress + 2)
    if (fy1 || fy2) return { fy1, fy2 }
  }

  const epsSorted = [...estimates.eps].sort((a, b) => a.fiscalYear - b.fiscalYear)
  const revSorted = [...estimates.revenue].sort((a, b) => a.fiscalYear - b.fiscalYear)
  const fy1Year = epsSorted[0]?.fiscalYear ?? revSorted[0]?.fiscalYear
  const fy2Year = epsSorted[1]?.fiscalYear ?? revSorted[1]?.fiscalYear
  return {
    fy1: fy1Year !== undefined ? findYear(fy1Year) : undefined,
    fy2: fy2Year !== undefined ? findYear(fy2Year) : undefined,
  }
}

export function createInitialContext(
  input: FairValueInput,
  forwardEstimates: ForwardEstimatesSeries | null,
): FairValueBuildContext | null {
  let operating =
    buildBaseOperatingMetrics(input.facts, input.incomeAnnual) ??
    buildEquityOperatingMetrics(input.facts, input.incomeAnnual)
  if (!operating) return null

  const { fy1, fy2 } = resolveForwardYears(input, forwardEstimates)

  return {
    input,
    subProfileId: 'insufficient',
    operating,
    forwardFy1: fy1,
    forwardFy2: fy2,
    qualityMultiplier: 1,
    qualityNotes: [],
    warnings: [],
  }
}

export function projectNetDebtForward(
  netDebtToday: number,
  fcfYear1?: number,
  fcfYear2?: number,
): number {
  let nd = netDebtToday
  for (const fcf of [fcfYear1, fcfYear2]) {
    if (fcf !== undefined && Number.isFinite(fcf)) nd = Math.max(0, nd - fcf)
  }
  return nd
}

export function medianOf(values: number[]): number | undefined {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b)
  if (v.length === 0) return undefined
  const mid = Math.floor(v.length / 2)
  return v.length % 2 === 0 ? (v[mid - 1]! + v[mid]!) / 2 : v[mid]
}
