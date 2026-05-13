import { num } from './normalize'
import type { JsonRecord } from './normalize'
import type { CompanyRawPack } from './fetchCompanyRawPack'

export interface CompanyFacts {
  symbol: string
  companyName: string
  sector: string
  industry: string
  mktCap?: number
  price?: number
  priceToTangibleBook?: number

  peTrailing?: number
  forwardPe?: number
  forwardPeSource?: 'analyst' | 'ratios' | 'key_metrics'
  priceToBook?: number
  pegRatio?: number

  enterpriseValue?: number
  evToEbitda?: number
  evToEbit?: number
  fcfYield?: number
  dividendYield?: number

  roe?: number
  roa?: number
  roic?: number
  operatingMargin?: number
  ebitdaMargin?: number
  grossMargin?: number

  netDebtToEbitda?: number
  interestCoverage?: number
  debtToEquity?: number
  debtToCapital?: number

  operatingCashFlowTtm?: number
  netIncomeTtm?: number
  freeCashFlowTtm?: number
  revenueTtm?: number
  ocfToNetIncome?: number

  enterpriseValueToGrossProfit?: number
  enterpriseValueToRevenue?: number

  piotroski?: number

  annualEps: number[]
  annualGrossMargin: number[]
  annualRevenue: number[]

  /** Absolute TTM dollars from income/cash-flow TTM statements when available */
  ocfTtmAbsolute?: number
  niTtmAbsolute?: number
  fcfTtmAbsolute?: number
  capexTtmAbsolute?: number
  revenueTtmAbsolute?: number
  operatingExpensesTtm?: number
  interestExpenseTtm?: number
  interestIncomeTtm?: number

  /** Latest annual balance sheet (FMP list is usually newest first) */
  totalAssets?: number
  totalEquity?: number
  totalDebt?: number
  cashAndEquivalents?: number
  goodwill?: number
  intangibleAssets?: number
  longTermDebt?: number
  deferredRevenue?: number

  tangibleCommonEquityRatio?: number
  ocfToCapexTtm?: number
  netCashToRevenueTtm?: number
  securedDebtRatio?: number
  bankEfficiencyRatio?: number

  /** REIT / cash-flow derived */
  ffoPerShare?: number
  priceToFfo?: number

  /** Dividend: TTM yield vs median of prior FY implied yields (DPS/price) */
  dividendYieldMedianHistorical?: number
  annualDps?: number[]

  /** Revenue growth proxy for REIT same-store style */
  revenueCagr3y?: number

  /** Deferred revenue YoY growth (%) if balance sheet has field */
  deferredRevenueYoY?: number

  /** Bank: non-interest expense / revenue from annual income (lower is more efficient). */
  annualEfficiencyRatio: number[]
  /** Insurer combined ratio when present on ratios TTM (lower is better; often >1 as decimal). */
  combinedRatio?: number
  /** Bank NIM-style spread proxy when present. */
  netInterestMargin?: number
  /** Bank asset quality when present (NPL / loans or similar). */
  nonPerformingLoansRatio?: number
  /** FCF / revenue TTM and own historical median (annual statements; proxy for “own FCF yield history”). */
  fcfToRevenueTtm?: number
  fcfToRevenueMedian5y?: number
}

function pick(o: JsonRecord | undefined, keys: string[]): number | undefined {
  if (!o) return undefined
  for (const k of keys) {
    const v = o[k]
    const n = num(v)
    if (n !== undefined) return n
  }
  return undefined
}

function extractPiotroski(sc?: JsonRecord): number | undefined {
  if (!sc) return undefined
  const direct = num(sc.piotroskiScore, sc.piotroski, sc.score)
  if (direct !== undefined) return direct
  for (const [k, v] of Object.entries(sc)) {
    if (/piotroski/i.test(k)) {
      const n = num(v)
      if (n !== undefined && n >= 0 && n <= 9) return n
    }
  }
  return undefined
}

function computeAnalystForwardPe(price: number | undefined, estimates: JsonRecord[]): number | undefined {
  if (price === undefined || price <= 0 || !estimates.length) return undefined
  let bestEps: number | undefined
  let bestYear = -Infinity
  for (const row of estimates) {
    const y = pick(row, ['calendarYear', 'fiscalYear'])
    const eps = pick(row, ['estimatedEpsAvg', 'estimatedEarningsAvg', 'epsAvg'])
    if (eps === undefined || eps <= 0 || y === undefined) continue
    if (y > bestYear) {
      bestYear = y
      bestEps = eps
    }
  }
  if (bestEps === undefined || bestEps <= 0) return undefined
  return price / bestEps
}

function pairAnnualDividendsPerShare(
  income: JsonRecord[],
  cashFlow: JsonRecord[],
): number[] {
  const dps: number[] = []
  const n = Math.min(income.length, cashFlow.length)
  for (let i = 0; i < n; i++) {
    const div = pick(cashFlow[i], ['dividendsPaid', 'netDividendsPaid', 'commonDividendsPaid'])
    const sh = pick(income[i], ['weightedAverageShsOutDil', 'weightedAverageShsOut'])
    if (div === undefined || sh === undefined || sh <= 0) continue
    dps.push(Math.abs(div) / sh)
  }
  return dps
}

export function buildCompanyFacts(symbol: string, pack: CompanyRawPack): CompanyFacts {
  const p = pack.profile
  const q = pack.quote
  const km = pack.keyMetricsTtm
  const r = pack.ratiosTtm
  const sc = pack.score
  const incTtm = pack.incomeTtm
  const cfTtm = pack.cashFlowTtm
  const bs0 = pack.balanceSheetAnnual[0]

  const companyName = typeof p?.companyName === 'string' ? p.companyName : symbol.toUpperCase()
  const sector = typeof p?.sector === 'string' ? p.sector : 'Unknown'
  const industry = typeof p?.industry === 'string' ? p.industry : 'Unknown'

  const annualEps = pack.incomeAnnual
    .map((row) => pick(row, ['epsdiluted', 'eps']))
    .filter((v): v is number => v !== undefined)

  const annualGrossMargin = pack.incomeAnnual
    .map((row) => pick(row, ['grossProfitRatio', 'grossProfitMargin']))
    .filter((v): v is number => v !== undefined)

  const annualRevenue = pack.incomeAnnual
    .map((row) => pick(row, ['revenue']))
    .filter((v): v is number => v !== undefined)

  const annualDps = pairAnnualDividendsPerShare(pack.incomeAnnual, pack.cashFlowAnnual)

  const price = pick(q, ['price'])
  const peTrailing = pick(q, ['pe']) ?? pick(km, ['peRatio']) ?? pick(r, ['priceEarningsRatio'])

  let forwardPe = pick(r, ['forwardPriceToEarnings', 'forwardPE']) ?? pick(km, ['forwardPe', 'forwardPE'])
  let forwardPeSource: CompanyFacts['forwardPeSource'] = undefined
  if (pick(r, ['forwardPriceToEarnings', 'forwardPE']) !== undefined) forwardPeSource = 'ratios'
  else if (pick(km, ['forwardPe', 'forwardPE']) !== undefined) forwardPeSource = 'key_metrics'
  const analystPe = computeAnalystForwardPe(price, pack.analystEstimates)
  if (analystPe !== undefined) {
    forwardPe = analystPe
    forwardPeSource = 'analyst'
  }

  const priceToBook = pick(km, ['pbRatio', 'priceToBookRatio']) ?? pick(r, ['priceToBookRatio'])
  const pegRatio = pick(km, ['pegRatio']) ?? pick(r, ['pegRatio'])
  const dividendYield = pick(km, ['dividendYield']) ?? pick(r, ['dividendYield'])

  const enterpriseValue = pick(km, ['enterpriseValue'])
  const evToEbitda =
    pick(km, ['enterpriseValueOverEBITDA', 'evToEBITDATTM']) ?? pick(r, ['enterpriseValueMultiple'])
  const evToEbit = pick(km, ['enterpriseValueOverEBIT', 'evToEBITTTM']) ?? pick(r, ['enterpriseValueOverEBIT'])

  const fcfYield = pick(km, ['freeCashFlowYield']) ?? pick(r, ['freeCashFlowYield'])

  const roe = pick(km, ['roe']) ?? pick(r, ['returnOnEquity'])
  const roa = pick(r, ['returnOnAssets'])
  const roic = pick(km, ['roic']) ?? pick(r, ['returnOnCapitalEmployed'])
  const operatingMargin = pick(km, ['operatingProfitMargin']) ?? pick(r, ['operatingProfitMargin'])
  const ebitdaMargin = pick(km, ['ebitdaMargin']) ?? pick(r, ['ebitdaMargin'])
  const grossMargin = pick(km, ['grossProfitMargin']) ?? pick(r, ['grossProfitMargin'])

  const netDebtToEbitda = pick(km, ['netDebtToEBITDA', 'netDebtToEbitda']) ?? pick(r, ['netDebtToEBITDA'])
  const interestCoverage = pick(r, ['interestCoverage']) ?? pick(km, ['interestCoverage'])
  const debtToEquity = pick(r, ['debtEquityRatio', 'debtToEquity']) ?? pick(km, ['debtToEquity'])

  let debtToCapital: number | undefined
  if (debtToEquity !== undefined && debtToEquity >= 0) {
    debtToCapital = debtToEquity / (1 + debtToEquity)
  }

  const operatingCashFlowTtm = pick(km, ['operatingCashFlowPerShareTTM'])
  const netIncomeTtm = pick(km, ['netIncomePerShareTTM'])
  const freeCashFlowTtm = pick(km, ['freeCashFlowPerShareTTM'])
  const revenueTtmTotal = pick(km, ['revenue']) ?? pick(km, ['revenuePerShareTTM'])
  const revenueTtm = revenueTtmTotal

  const ocfNiFromKm = pick(km, ['incomeQuality', 'operatingCashFlowRatio'])
  let ocfToNetIncome: number | undefined
  if (ocfNiFromKm !== undefined) {
    ocfToNetIncome = ocfNiFromKm
  }

  const ocfAbs = pick(cfTtm, ['operatingCashFlow', 'netCashProvidedByOperatingActivities'])
  const niAbs = pick(incTtm, ['netIncome'])
  const fcfAbs = pick(cfTtm, ['freeCashFlow'])
  const capexRaw = pick(cfTtm, ['capitalExpenditure', 'investmentsInPropertyPlantAndEquipment'])
  const capexAbs = capexRaw !== undefined ? Math.abs(capexRaw) : undefined
  const revAbs = pick(incTtm, ['revenue'])
  const opEx = pick(incTtm, ['operatingExpenses', 'totalOperatingExpenses', 'sellingGeneralAndAdministrativeExpenses'])
  const interestExp = pick(incTtm, ['interestExpense'])
  const interestInc = pick(incTtm, ['interestIncome', 'interestIncomeExpense'])

  if (ocfAbs !== undefined && niAbs !== undefined && Math.abs(niAbs) > 1e-6) {
    ocfToNetIncome = ocfAbs / niAbs
  }

  const grossProfitApprox =
    revenueTtm !== undefined && grossMargin !== undefined ? revenueTtm * grossMargin : undefined
  let enterpriseValueToGrossProfit: number | undefined
  if (enterpriseValue !== undefined && grossProfitApprox !== undefined && grossProfitApprox !== 0) {
    enterpriseValueToGrossProfit = enterpriseValue / grossProfitApprox
  }

  let enterpriseValueToRevenue: number | undefined
  if (enterpriseValue !== undefined && revenueTtm !== undefined && revenueTtm !== 0) {
    enterpriseValueToRevenue = enterpriseValue / revenueTtm
  }

  const piotroski = extractPiotroski(sc)

  const totalAssets = pick(bs0, ['totalAssets'])
  const totalEquity = pick(bs0, ['totalStockholdersEquity', 'totalEquity'])
  const longTermDebt = pick(bs0, ['longTermDebt', 'longTermDebtNoncurrent'])
  const shortDebt = pick(bs0, ['shortTermDebt', 'shortTermDebtCurrent', 'currentDebt'])
  const totalDebtBs =
    pick(bs0, ['totalDebt']) ??
    (longTermDebt !== undefined || shortDebt !== undefined
      ? (longTermDebt ?? 0) + (shortDebt ?? 0)
      : undefined)
  const cashAndEquivalents = pick(bs0, ['cashAndCashEquivalents', 'cashAndShortTermInvestments', 'cash'])
  const goodwill = pick(bs0, ['goodwill'])
  const intangibleAssets = pick(bs0, ['intangibleAssets', 'otherIntangibleAssets'])
  const deferredRevenue = pick(bs0, ['deferredRevenue', 'deferredTaxLiabilitiesNonCurrent'])

  let tangibleCommonEquityRatio: number | undefined
  if (totalAssets !== undefined && totalAssets > 0 && totalEquity !== undefined) {
    const tang = totalEquity - (goodwill ?? 0) - (intangibleAssets ?? 0)
    tangibleCommonEquityRatio = tang / totalAssets
  }

  let ocfToCapexTtm: number | undefined
  if (ocfAbs !== undefined && capexAbs !== undefined && capexAbs > 1e-6) {
    ocfToCapexTtm = ocfAbs / capexAbs
  }

  let netCashToRevenueTtm: number | undefined
  if (cashAndEquivalents !== undefined && totalDebtBs !== undefined && revAbs !== undefined && revAbs > 0) {
    netCashToRevenueTtm = (cashAndEquivalents - totalDebtBs) / revAbs
  }

  let securedDebtRatio: number | undefined
  if (longTermDebt !== undefined && totalDebtBs !== undefined && totalDebtBs > 0) {
    securedDebtRatio = longTermDebt / totalDebtBs
  }

  let bankEfficiencyRatio: number | undefined
  const effFromRatio = pick(r, ['bankEfficiencyRatio', 'efficiencyRatio'])
  if (effFromRatio !== undefined) {
    bankEfficiencyRatio = effFromRatio
  } else if (opEx !== undefined && revAbs !== undefined && revAbs > 0) {
    bankEfficiencyRatio = opEx / revAbs
  }

  const ffoPerShare =
    pick(km, ['ffoPerShareTTM', 'fundsFromOperationsPerShareTTM']) ?? pick(km, ['operatingCashFlowPerShareTTM'])
  let priceToFfo: number | undefined
  if (price !== undefined && ffoPerShare !== undefined && ffoPerShare > 0) {
    priceToFfo = price / ffoPerShare
  }

  let dividendYieldMedianHistorical: number | undefined
  if (annualDps.length >= 2 && price !== undefined && price > 0) {
    const slice = annualDps.slice(0, Math.min(5, annualDps.length))
    const impliedYields = slice.map((dps) => dps / price)
    const sorted = [...impliedYields].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    dividendYieldMedianHistorical =
      sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1]! + sorted[mid]!) / 2
  }

  let revenueCagr3y: number | undefined
  if (annualRevenue.length >= 3) {
    const r0 = annualRevenue[0]
    const r2 = annualRevenue[2]
    if (r0 !== undefined && r2 !== undefined && r2 > 0) {
      revenueCagr3y = (Math.pow(r0 / r2, 1 / 2) - 1) * 100
    }
  }

  let deferredRevenueYoY: number | undefined
  const bs1 = pack.balanceSheetAnnual[1]
  if (deferredRevenue !== undefined && bs1) {
    const prev = pick(bs1, ['deferredRevenue', 'deferredTaxLiabilitiesNonCurrent'])
    if (prev !== undefined && Math.abs(prev) > 1e-6) {
      deferredRevenueYoY = ((deferredRevenue - prev) / Math.abs(prev)) * 100
    }
  }

  const annualEfficiencyRatio: number[] = []
  for (const row of pack.incomeAnnual) {
    const rev = pick(row, ['revenue'])
    const opex = pick(row, [
      'operatingExpenses',
      'totalOperatingExpenses',
      'sellingGeneralAndAdministrativeExpenses',
    ])
    if (rev !== undefined && rev > 0 && opex !== undefined) {
      annualEfficiencyRatio.push(opex / rev)
    }
  }

  const combinedRatio =
    pick(r, ['combinedRatio']) ??
    pick(r, ['lossRatio', 'combinedLossAndExpenseRatio']) ??
    pick(km, ['combinedRatio'])

  const netInterestMargin =
    pick(r, ['netInterestMargin', 'bankNetInterestMargin']) ?? pick(km, ['netInterestMargin', 'bankNetInterestMargin'])

  const nonPerformingLoansRatio =
    pick(km, ['nonPerformingLoansToLoansRatio', 'nonPerformingLoansRatio', 'nplRatio']) ??
    pick(r, ['nonPerformingLoansToLoans', 'nonPerformingLoansRatio'])

  let fcfToRevenueTtm: number | undefined
  if (fcfAbs !== undefined && revAbs !== undefined && revAbs > 0) {
    fcfToRevenueTtm = fcfAbs / revAbs
  }

  const fcfRevAnnual: number[] = []
  const nPair = Math.min(pack.cashFlowAnnual.length, pack.incomeAnnual.length)
  for (let i = 0; i < nPair; i++) {
    const fcfA = pick(pack.cashFlowAnnual[i], ['freeCashFlow'])
    const revA = pick(pack.incomeAnnual[i], ['revenue'])
    if (fcfA !== undefined && revA !== undefined && revA > 0) {
      fcfRevAnnual.push(fcfA / revA)
    }
  }

  let fcfToRevenueMedian5y: number | undefined
  if (fcfRevAnnual.length >= 2) {
    const slice = fcfRevAnnual.slice(0, Math.min(5, fcfRevAnnual.length))
    const sorted = [...slice].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    fcfToRevenueMedian5y =
      sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
  }

  return {
    symbol: symbol.toUpperCase(),
    companyName,
    sector,
    industry,
    mktCap: pick(q, ['marketCap']) ?? pick(p, ['mktCap']),
    price,
    priceToTangibleBook: (() => {
      const px = pick(q, ['price'])
      const tbv = pick(km, ['tangibleBookValuePerShare'])
      if (px !== undefined && tbv !== undefined && tbv > 0) return px / tbv
      return undefined
    })(),
    peTrailing,
    forwardPe,
    forwardPeSource,
    priceToBook,
    pegRatio,
    enterpriseValue,
    evToEbitda,
    evToEbit,
    fcfYield,
    dividendYield,
    roe,
    roa,
    roic,
    operatingMargin,
    ebitdaMargin,
    grossMargin,
    netDebtToEbitda,
    interestCoverage,
    debtToEquity,
    debtToCapital,
    operatingCashFlowTtm,
    netIncomeTtm,
    freeCashFlowTtm,
    revenueTtm,
    ocfToNetIncome,
    enterpriseValueToGrossProfit,
    enterpriseValueToRevenue,
    piotroski,
    annualEps,
    annualGrossMargin,
    annualRevenue,
    ocfTtmAbsolute: ocfAbs,
    niTtmAbsolute: niAbs,
    fcfTtmAbsolute: fcfAbs,
    capexTtmAbsolute: capexAbs,
    revenueTtmAbsolute: revAbs,
    operatingExpensesTtm: opEx,
    interestExpenseTtm: interestExp,
    interestIncomeTtm: interestInc,
    totalAssets,
    totalEquity,
    totalDebt: totalDebtBs,
    cashAndEquivalents,
    goodwill,
    intangibleAssets,
    longTermDebt,
    deferredRevenue,
    tangibleCommonEquityRatio,
    ocfToCapexTtm,
    netCashToRevenueTtm,
    securedDebtRatio,
    bankEfficiencyRatio,
    ffoPerShare,
    priceToFfo,
    dividendYieldMedianHistorical,
    annualDps,
    revenueCagr3y,
    deferredRevenueYoY,
    annualEfficiencyRatio,
    combinedRatio,
    netInterestMargin,
    nonPerformingLoansRatio,
    fcfToRevenueTtm,
    fcfToRevenueMedian5y,
  }
}
