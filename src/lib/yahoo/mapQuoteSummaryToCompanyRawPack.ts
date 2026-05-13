import type { CompanyRawPack } from '../fmp/fetchCompanyRawPack'
import { num, type JsonRecord } from '../fmp/normalize'

/** Yahoo quoteSummary modules return either an array or `{ <name>History: Row[] }`. */
function historyRows(mod: unknown, innerKey: string): JsonRecord[] {
  if (!mod) return []
  if (Array.isArray(mod)) return mod as JsonRecord[]
  if (typeof mod === 'object') {
    const o = mod as JsonRecord
    const a = o[innerKey]
    if (Array.isArray(a)) return a as JsonRecord[]
    const self = o[innerKey.replace(/History$/, '')]
    if (Array.isArray(self)) return self as JsonRecord[]
  }
  return []
}

function mapIncomeLikeRow(y: JsonRecord): JsonRecord {
  const revenue = num(y.totalRevenue, y.revenue)
  const gp = num(y.grossProfit)
  const gm = revenue !== undefined && revenue > 0 && gp !== undefined ? gp / revenue : undefined
  const opex = num(y.totalOperatingExpenses, y.sellingGeneralAndAdministrative, y.researchDevelopment)
  const opexSynth =
    opex ??
    (revenue !== undefined && gp !== undefined && num(y.operatingIncome) !== undefined
      ? revenue - gp - num(y.operatingIncome)!
      : undefined)
  return {
    date: y.endDate instanceof Date ? y.endDate.toISOString().slice(0, 10) : String(y.endDate ?? ''),
    revenue,
    netIncome: num(y.netIncome),
    epsdiluted: num(y.dilutedEPS),
    eps: num(y.basicEPS),
    grossProfitRatio: gm,
    grossProfitMargin: gm,
    operatingIncome: num(y.operatingIncome),
    operatingExpenses: opexSynth,
    totalOperatingExpenses: opexSynth,
    interestExpense: num(y.interestExpense),
    interestIncome: num(y.interestIncome),
    weightedAverageShsOutDil: num(y.weightedAverageDilutedSharesOutstanding, y.dilutedAverageShares),
    weightedAverageShsOut: num(y.weightedAverageShsOutstanding, y.basicAverageShares),
  }
}

function mapCashflowLikeRow(y: JsonRecord): JsonRecord {
  return {
    date: y.endDate instanceof Date ? y.endDate.toISOString().slice(0, 10) : String(y.endDate ?? ''),
    operatingCashFlow: num(y.totalCashFromOperatingActivities, y.operatingCashflow),
    netCashProvidedByOperatingActivities: num(y.totalCashFromOperatingActivities, y.operatingCashflow),
    freeCashFlow: num(y.freeCashflow),
    capitalExpenditure: num(y.capitalExpenditure, y.investmentsInPropertyPlantAndEquipment),
    dividendsPaid: num(y.commonStockDividendPaid, y.dividendsPaid),
    netDividendsPaid: num(y.commonStockDividendPaid, y.dividendsPaid),
  }
}

function mapBalanceLikeRow(y: JsonRecord): JsonRecord {
  return {
    date: y.endDate instanceof Date ? y.endDate.toISOString().slice(0, 10) : String(y.endDate ?? ''),
    totalAssets: num(y.totalAssets),
    totalStockholdersEquity: num(y.totalStockholderEquity, y.commonStockTotalEquity, y.totalEquityGrossMinorityInterest),
    totalEquity: num(y.totalStockholderEquity, y.commonStockTotalEquity),
    totalDebt: num(y.totalDebt),
    cashAndCashEquivalents: num(y.cash, y.cashAndCashEquivalents),
    longTermDebt: num(y.longTermDebt),
    shortTermDebt: num(y.shortLongTermDebt, y.currentDebt),
    goodwill: num(y.goodwill),
    intangibleAssets: num(y.intangibleAssets, y.otherIntangibleAssets),
    deferredRevenue: num(y.deferredLongTermLiabilityCharges),
  }
}

function sumQuarterlyLike(rows: JsonRecord[], keys: string[]): JsonRecord {
  const take = rows.slice(0, 4)
  const out: JsonRecord = {}
  for (const k of keys) {
    let s = 0
    let ok = false
    for (const row of take) {
      const v = num(row[k])
      if (v !== undefined) {
        s += v
        ok = true
      }
    }
    if (ok) out[k] = s
  }
  return out
}

function earningsTrendToEstimates(earningsTrend: unknown): JsonRecord[] {
  if (!earningsTrend || typeof earningsTrend !== 'object') return []
  const t = (earningsTrend as JsonRecord).trend
  if (!Array.isArray(t)) return []
  const out: JsonRecord[] = []
  for (const row of t) {
    const r = row as JsonRecord
    const end = r.endDate
    let calendarYear: number | undefined
    if (end instanceof Date) calendarYear = end.getUTCFullYear()
    else if (typeof end === 'string' && end.length >= 4) calendarYear = Number(end.slice(0, 4))
    const epsObj = r.epsTrend ?? r.earningsEstimate
    const estimatedEpsAvg =
      num(epsObj) ??
      num(typeof epsObj === 'object' && epsObj ? (epsObj as JsonRecord).avg : undefined) ??
      num(typeof epsObj === 'object' && epsObj ? (epsObj as JsonRecord).raw : undefined)
    if (calendarYear !== undefined && estimatedEpsAvg !== undefined) {
      out.push({ calendarYear, estimatedEpsAvg })
    }
  }
  return out
}

/**
 * Maps a yahoo-finance2 `quoteSummary` result (single `result[0]` object) into the FMP-shaped pack
 * consumed by `buildCompanyFacts`. (Package: **yahoo-finance2** for Node — not Python **yfinance**.)
 */
export function mapQuoteSummaryToCompanyRawPack(symbol: string, summary: unknown): CompanyRawPack {
  const s = summary as JsonRecord
  const sym = symbol.toUpperCase()

  const priceMod = s.price as JsonRecord | undefined
  const profileMod = s.summaryProfile as JsonRecord | undefined
  const fin = s.financialData as JsonRecord | undefined
  const dks = s.defaultKeyStatistics as JsonRecord | undefined
  const sd = s.summaryDetail as JsonRecord | undefined

  const incomeAnnual = historyRows(s.incomeStatementHistory, 'incomeStatementHistory').map((r) =>
    mapIncomeLikeRow(r),
  )
  const cashAnnual = historyRows(s.cashflowStatementHistory, 'cashflowStatementHistory').map((r) =>
    mapCashflowLikeRow(r),
  )
  const balanceAnnual = historyRows(s.balanceSheetHistory, 'balanceSheetHistory').map((r) => mapBalanceLikeRow(r))

  const incQRaw = historyRows(s.incomeStatementHistoryQuarterly, 'incomeStatementHistoryQuarterly')
  const cfQRaw = historyRows(s.cashflowStatementHistoryQuarterly, 'cashflowStatementHistoryQuarterly')

  const ttmIncRaw = sumQuarterlyLike(incQRaw, [
    'totalRevenue',
    'netIncome',
    'grossProfit',
    'operatingIncome',
    'interestExpense',
    'interestIncome',
    'totalOperatingExpenses',
  ])
  const ttmCfRaw = sumQuarterlyLike(cfQRaw, [
    'totalCashFromOperatingActivities',
    'operatingCashflow',
    'freeCashflow',
    'capitalExpenditure',
  ])

  const revTtm = num(ttmIncRaw.totalRevenue)
  const gpTtm = num(ttmIncRaw.grossProfit)
  const gmTtm = revTtm !== undefined && revTtm > 0 && gpTtm !== undefined ? gpTtm / revTtm : undefined
  const oiTtm = num(ttmIncRaw.operatingIncome)
  const opexTtm =
    num(ttmIncRaw.totalOperatingExpenses) ??
    (revTtm !== undefined && gpTtm !== undefined && oiTtm !== undefined ? revTtm - gpTtm - oiTtm : undefined)

  const incomeTtm: JsonRecord = {
    revenue: revTtm,
    netIncome: num(ttmIncRaw.netIncome),
    operatingIncome: oiTtm,
    grossProfit: gpTtm,
    grossProfitRatio: gmTtm,
    grossProfitMargin: gmTtm,
    operatingExpenses: opexTtm,
    totalOperatingExpenses: opexTtm,
    interestExpense: num(ttmIncRaw.interestExpense),
    interestIncome: num(ttmIncRaw.interestIncome),
  }

  const cashFlowTtm: JsonRecord = {
    operatingCashFlow: num(ttmCfRaw.totalCashFromOperatingActivities, ttmCfRaw.operatingCashflow),
    netCashProvidedByOperatingActivities: num(ttmCfRaw.totalCashFromOperatingActivities, ttmCfRaw.operatingCashflow),
    freeCashFlow: num(ttmCfRaw.freeCashflow),
    capitalExpenditure: num(ttmCfRaw.capitalExpenditure),
  }

  const mktCap = num(priceMod?.marketCap)
  const lastPrice = num(priceMod?.regularMarketPrice, priceMod?.regularMarketPreviousClose)
  const shares = num(dks?.sharesOutstanding, dks?.impliedSharesOutstanding)

  const profile: JsonRecord = {
    symbol: sym,
    companyName: String(profileMod?.longName ?? priceMod?.longName ?? priceMod?.shortName ?? sym),
    sector: String(profileMod?.sector ?? 'Unknown'),
    industry: String(profileMod?.industry ?? 'Unknown'),
    mktCap,
  }

  const quote: JsonRecord = {
    price: lastPrice,
    pe: num(dks?.trailingPE, priceMod?.trailingPE),
    marketCap: mktCap,
  }

  const roe = num(fin?.returnOnEquity)
  const roa = num(fin?.returnOnAssets)
  const keyMetricsTtm: JsonRecord = {
    peRatio: num(dks?.trailingPE, quote.pe),
    pbRatio: num(dks?.priceToBook),
    pegRatio: num(dks?.pegRatio),
    forwardPe: num(dks?.forwardPE),
    forwardPE: num(dks?.forwardPE),
    dividendYield: num(sd?.dividendYield, fin?.dividendYield),
    enterpriseValue: num(dks?.enterpriseValue),
    enterpriseValueOverEBITDA: num(dks?.enterpriseToEbitda),
    enterpriseValueOverEBIT: num(dks?.enterpriseToEbit, dks?.enterpriseToRevenue),
    freeCashFlowYield: (() => {
      const fcf = num(cashFlowTtm.freeCashFlow)
      if (fcf === undefined || mktCap === undefined || mktCap <= 0) return undefined
      return fcf / mktCap
    })(),
    roe,
    roic: num(fin?.returnOnAssets),
    operatingProfitMargin: num(fin?.operatingMargins),
    ebitdaMargin: num(fin?.ebitdaMargins),
    grossProfitMargin: num(fin?.grossMargins),
    netDebtToEBITDA: undefined,
    debtToEquity: num(fin?.debtToEquity),
    revenue: revTtm,
    revenuePerShareTTM:
      revTtm !== undefined && shares !== undefined && shares > 0 ? revTtm / shares : undefined,
    netIncomePerShareTTM:
      num(ttmIncRaw.netIncome) !== undefined && shares !== undefined && shares > 0
        ? num(ttmIncRaw.netIncome)! / shares
        : num(dks?.trailingEps),
    operatingCashFlowPerShareTTM:
      num(cashFlowTtm.operatingCashFlow) !== undefined && shares !== undefined && shares > 0
        ? num(cashFlowTtm.operatingCashFlow)! / shares
        : undefined,
    freeCashFlowPerShareTTM:
      num(cashFlowTtm.freeCashFlow) !== undefined && shares !== undefined && shares > 0
        ? num(cashFlowTtm.freeCashFlow)! / shares
        : undefined,
    ffoPerShareTTM: undefined,
    tangibleBookValuePerShare: num(dks?.bookValue),
  }

  const intExp = num(ttmIncRaw.interestExpense)
  const interestCov =
    oiTtm !== undefined && intExp !== undefined && Math.abs(intExp) > 1e-9 ? oiTtm / Math.abs(intExp) : undefined

  const ratiosTtm: JsonRecord = {
    priceEarningsRatio: num(dks?.trailingPE, quote.pe),
    forwardPriceToEarnings: num(dks?.forwardPE),
    forwardPE: num(dks?.forwardPE),
    priceToBookRatio: num(dks?.priceToBook),
    pegRatio: num(dks?.pegRatio),
    dividendYield: num(sd?.dividendYield, fin?.dividendYield),
    enterpriseValueMultiple: num(dks?.enterpriseToEbitda),
    enterpriseValueOverEBIT: num(dks?.enterpriseToEbit, dks?.enterpriseToRevenue),
    freeCashFlowYield: keyMetricsTtm.freeCashFlowYield,
    returnOnEquity: roe,
    returnOnAssets: roa,
    returnOnCapitalEmployed: num(fin?.returnOnEquity),
    operatingProfitMargin: num(fin?.operatingMargins),
    ebitdaMargin: num(fin?.ebitdaMargins),
    grossProfitMargin: num(fin?.grossMargins),
    netDebtToEBITDA: undefined,
    debtEquityRatio: num(fin?.debtToEquity),
    interestCoverage: interestCov,
    bankEfficiencyRatio: undefined,
    netInterestMargin: undefined,
    combinedRatio: undefined,
    nonPerformingLoansToLoansRatio: undefined,
  }

  const analystEstimates = earningsTrendToEstimates(s.earningsTrend)

  return {
    profile,
    quote,
    keyMetricsTtm: keyMetricsTtm as CompanyRawPack['keyMetricsTtm'],
    ratiosTtm: ratiosTtm as CompanyRawPack['ratiosTtm'],
    incomeAnnual: incomeAnnual,
    cashFlowAnnual: cashAnnual,
    incomeTtm: incomeTtm as CompanyRawPack['incomeTtm'],
    cashFlowTtm: cashFlowTtm as CompanyRawPack['cashFlowTtm'],
    balanceSheetAnnual: balanceAnnual,
    analystEstimates,
    score: undefined,
    peers: [],
  }
}
