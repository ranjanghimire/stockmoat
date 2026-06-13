import { headquartersFromFmpProfile, industryFromFmpProfile, sectorFromFmpProfile } from './profileClassification'
import { num, normalizeMarginRatio } from './normalize'
import type { JsonRecord } from './normalize'
import type { CompanyRawPack } from './fetchCompanyRawPack'

/** Listing / quote currency for formatting (FMP profile or quote; Yahoo quote after mapping). */
export function listingCurrencyFromPack(pack: CompanyRawPack): string {
  const q = pack.quote as JsonRecord | undefined
  const p = pack.profile as JsonRecord | undefined
  const fromQuote = q?.currency
  const fromProfile = p?.currency
  const cur =
    (typeof fromQuote === 'string' && fromQuote.trim()) ||
    (typeof fromProfile === 'string' && fromProfile.trim()) ||
    ''
  return cur || 'USD'
}

export interface CompanyFacts {
  symbol: string
  companyName: string
  sector: string
  industry: string
  /** Formatted HQ location from company profile when available. */
  headquarters?: string
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

  /** EPS growth % for PEG (FMP TTM / analyst / capped YoY fallback). */
  epsGrowthPercent?: number
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

function grossMarginFromIncomeRow(row: JsonRecord | undefined): number | undefined {
  if (!row) return undefined
  const ratioRaw = pick(row, ['grossProfitRatio', 'grossProfitMargin'])
  const ratio = normalizeMarginRatio(ratioRaw)
  if (ratio !== undefined) return ratio
  const gp = pick(row, ['grossProfit'])
  const rev = pick(row, ['revenue', 'sales', 'totalRevenue'])
  if (gp !== undefined && rev !== undefined && rev > 0) return gp / rev
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
    let y = pick(row, ['calendarYear', 'fiscalYear', 'year'])
    if (y === undefined) {
      const d = row.date
      if (typeof d === 'string' || typeof d === 'number') {
        const parsed = new Date(String(d))
        if (!Number.isNaN(parsed.getTime())) y = parsed.getFullYear()
      }
    }
    const eps = pick(row, [
      'estimatedEpsAvg',
      'estimatedEarningsAvg',
      'epsAvg',
      'estimatedEps',
      'eps',
    ])
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

const PEG_FIELD_KEYS = [
  'pegRatio',
  'pegRatioTTM',
  'pegTTM',
  'peg',
  'priceEarningsToGrowthRatioTTM',
  'priceEarningsToGrowthRatio',
  'priceToEarningsGrowthRatioTTM',
] as const

/** FMP growth fields may be decimal (0.18) or percent points (18). */
function normalizeGrowthPercent(v: number | undefined): number | undefined {
  if (v === undefined || !Number.isFinite(v)) return undefined
  if (Math.abs(v) <= 2.5) return v * 100
  return v
}

function epsGrowthPercentForPeg(
  km: JsonRecord | undefined,
  r: JsonRecord | undefined,
  annualEps: number[],
  analystEstimates: JsonRecord[],
): number | undefined {
  const fromFmp = normalizeGrowthPercent(
    pick(km, [
      'epsGrowthTTM',
      'netIncomePerShareGrowthTTM',
      'netIncomeGrowthTTM',
      'threeYNetIncomeGrowthPerShare',
      'earningsGrowthTTM',
      'epsGrowth',
      'netIncomeGrowth',
      'earningsGrowth',
      'netIncomePerShareGrowth',
    ]) ??
      pick(r, [
        'epsGrowthTTM',
        'netIncomePerShareGrowthTTM',
        'netIncomeGrowthTTM',
        'epsGrowth',
        'netIncomeGrowth',
        'earningsGrowth',
        'netIncomePerShareGrowth',
      ]),
  )
  if (fromFmp !== undefined && fromFmp > 0) return fromFmp

  if (annualEps.length >= 2) {
    const e0 = annualEps[0]!
    const e1 = annualEps[1]!
    if (e0 > 0 && e1 > 0 && e0 > e1) {
      return ((e0 - e1) / e1) * 100
    }
  }

  const byYear: { year: number; eps: number }[] = []
  for (const row of analystEstimates) {
    let y = pick(row, ['calendarYear', 'fiscalYear', 'year'])
    if (y === undefined) {
      const d = row.date
      if (typeof d === 'string' || typeof d === 'number') {
        const parsed = new Date(String(d))
        if (!Number.isNaN(parsed.getTime())) y = parsed.getFullYear()
      }
    }
    const eps = pick(row, ['estimatedEpsAvg', 'estimatedEarningsAvg', 'epsAvg', 'estimatedEps', 'eps'])
    if (y === undefined || eps === undefined || eps <= 0) continue
    byYear.push({ year: y, eps })
  }
  byYear.sort((a, b) => a.year - b.year)
  for (let i = 1; i < byYear.length; i++) {
    const prev = byYear[i - 1]!
    const next = byYear[i]!
    if (next.eps > prev.eps) {
      return ((next.eps - prev.eps) / prev.eps) * 100
    }
  }

  return undefined
}

function computePegFallback(
  pe: number | undefined,
  km: JsonRecord | undefined,
  r: JsonRecord | undefined,
  annualEps: number[],
  analystEstimates: JsonRecord[],
): number | undefined {
  if (pe === undefined || !Number.isFinite(pe) || pe <= 0) return undefined
  const growthPct = epsGrowthPercentForPeg(km, r, annualEps, analystEstimates)
  if (growthPct === undefined || growthPct <= 0) return undefined
  return pe / growthPct
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
  const incAnnual0 = pack.incomeAnnual[0]
  const cfAnnual0 = pack.cashFlowAnnual[0]
  /** TTM statements preferred; fall back to latest annual when TTM pack is empty (plan / endpoint gaps). */
  const incSrc: JsonRecord | undefined = incTtm ?? incAnnual0
  const cfSrc: JsonRecord | undefined = cfTtm ?? cfAnnual0

  const companyName = typeof p?.companyName === 'string' ? p.companyName : symbol.toUpperCase()
  const sector = sectorFromFmpProfile(p) ?? sectorFromFmpProfile(q) ?? 'Unknown'
  const industry = industryFromFmpProfile(p) ?? industryFromFmpProfile(q) ?? 'Unknown'
  const headquarters = headquartersFromFmpProfile(p) ?? headquartersFromFmpProfile(q)

  const annualEps = pack.incomeAnnual
    .map((row) => pick(row, ['epsdiluted', 'eps']))
    .filter((v): v is number => v !== undefined)

  const annualGrossMargin = pack.incomeAnnual
    .map((row) => grossMarginFromIncomeRow(row))
    .filter((v): v is number => v !== undefined)

  const annualRevenue = pack.incomeAnnual
    .map((row) => pick(row, ['revenue']))
    .filter((v): v is number => v !== undefined)

  const annualDps = pairAnnualDividendsPerShare(pack.incomeAnnual, pack.cashFlowAnnual)

  const price = pick(q, ['price'])
  const marketCap = pick(q, ['marketCap']) ?? pick(km, ['marketCap']) ?? pick(p, ['mktCap'])
  let peTrailing =
    pick(q, ['pe', 'peRatio', 'trailingPE', 'priceToEarnings']) ??
    pick(km, ['peRatio', 'priceEarningsRatio', 'trailingPe', 'trailingPE']) ??
    pick(r, ['priceEarningsRatio', 'peRatio', 'trailingPe', 'trailingPE'])

  const forwardPeFromRatios = pick(r, [
    'forwardPriceToEarnings',
    'forwardPE',
    'forwardPe',
    'forwardPeRatio',
    'forwardPERatio',
  ])
  const forwardPeFromKm = pick(km, [
    'forwardPeRatio',
    'forwardPERatio',
    'forwardPe',
    'forwardPE',
    'forwardPriceToEarnings',
  ])
  let forwardPe = forwardPeFromRatios ?? forwardPeFromKm
  let forwardPeSource: CompanyFacts['forwardPeSource'] = undefined
  if (forwardPeFromRatios !== undefined) forwardPeSource = 'ratios'
  else if (forwardPeFromKm !== undefined) forwardPeSource = 'key_metrics'
  const analystPe = computeAnalystForwardPe(price, pack.analystEstimates)
  if (analystPe !== undefined) {
    forwardPe = analystPe
    forwardPeSource = 'analyst'
  }
  if (
    (forwardPe === undefined || !Number.isFinite(forwardPe) || forwardPe <= 0) &&
    price !== undefined &&
    price > 0 &&
    pack.analystEstimates.length > 0
  ) {
    for (let i = pack.analystEstimates.length - 1; i >= 0; i--) {
      const row = pack.analystEstimates[i]!
      const eps = pick(row, [
        'estimatedEpsAvg',
        'estimatedEarningsAvg',
        'epsAvg',
        'estimatedEps',
        'eps',
      ])
      if (eps !== undefined && eps > 0) {
        forwardPe = price / eps
        forwardPeSource = 'analyst'
        break
      }
    }
  }

  const priceToBook = pick(km, ['pbRatio', 'priceToBookRatio']) ?? pick(r, ['priceToBookRatio'])
  let pegRatio =
    pick(q, [...PEG_FIELD_KEYS]) ??
    pick(km, [...PEG_FIELD_KEYS]) ??
    pick(r, [...PEG_FIELD_KEYS])
  const dividendYield = pick(km, ['dividendYield']) ?? pick(r, ['dividendYield'])

  let enterpriseValue =
    pick(km, ['enterpriseValue', 'enterpriseValueTTM']) ??
    pick(p, ['enterpriseValue']) ??
    pick(q, ['enterpriseValue'])
  const evToEbitda =
    pick(km, ['enterpriseValueOverEBITDA', 'evToEBITDATTM']) ?? pick(r, ['enterpriseValueMultiple'])
  let evToEbit =
    pick(km, ['enterpriseValueOverEBIT', 'evToEBITTTM', 'evToEbit']) ??
    pick(r, ['enterpriseValueOverEBIT', 'evToEbit'])

  let fcfYield =
    pick(km, ['freeCashFlowYield']) ?? pick(r, ['freeCashFlowYield', 'freeCashFlowYieldTTM', 'fcfYield'])

  let roe = normalizeMarginRatio(pick(km, ['roe', 'returnOnEquity']) ?? pick(r, ['returnOnEquity', 'roe']))
  const roa = pick(r, ['returnOnAssets'])
  let roic = normalizeMarginRatio(
    pick(km, ['roic', 'returnOnInvestedCapital', 'ROIC']) ??
      pick(r, ['returnOnCapitalEmployed', 'returnOnInvestedCapital', 'roic']),
  )
  let operatingMargin = normalizeMarginRatio(
    pick(km, ['operatingProfitMargin', 'operatingMargin']) ??
      pick(r, ['operatingProfitMargin', 'operatingMargin']),
  )
  const ebitdaMargin = pick(km, ['ebitdaMargin']) ?? pick(r, ['ebitdaMargin'])
  const grossMarginRaw =
    pick(km, ['grossProfitMargin']) ??
    pick(r, ['grossProfitMargin']) ??
    pick(incSrc, ['grossProfitRatio', 'grossProfitMargin'])
  const grossMargin = normalizeMarginRatio(grossMarginRaw)

  let netDebtToEbitda =
    pick(km, ['netDebtToEBITDA', 'netDebtToEbitda', 'netDebtToEBITDATTM']) ??
    pick(r, ['netDebtToEBITDA', 'netDebtToEbitda'])
  let interestCoverage =
    pick(r, ['interestCoverage', 'interestCoverageRatio']) ??
    pick(km, ['interestCoverage', 'interestCoverageRatio', 'interestCoverageTTM'])
  const debtToEquity = pick(r, ['debtEquityRatio', 'debtToEquity']) ?? pick(km, ['debtToEquity'])

  let debtToCapital: number | undefined
  if (debtToEquity !== undefined && debtToEquity >= 0) {
    debtToCapital = debtToEquity / (1 + debtToEquity)
  }

  const operatingCashFlowTtm = pick(km, ['operatingCashFlowPerShareTTM'])
  const netIncomeTtm = pick(km, ['netIncomePerShareTTM'])
  const freeCashFlowTtm = pick(km, ['freeCashFlowPerShareTTM'])
  /** Company-level revenue (USD). Avoid revenue-per-share alone — it breaks EV / GP. */
  let revenueTotalUsd =
    pick(incSrc, ['revenue', 'sales', 'totalRevenue']) ??
    pick(incAnnual0, ['revenue', 'sales', 'totalRevenue']) ??
    pick(km, ['revenue', 'totalRevenue'])
  if (revenueTotalUsd === undefined) {
    const rps = pick(km, ['revenuePerShareTTM', 'revenuePerShare'])
    const sh =
      pick(km, ['weightedAverageShsOutDil', 'weightedAverageShsOut']) ??
      pick(incSrc, ['weightedAverageShsOutDil', 'weightedAverageShsOut']) ??
      pick(incAnnual0, ['weightedAverageShsOutDil', 'weightedAverageShsOut'])
    if (rps !== undefined && sh !== undefined && sh > 0) {
      revenueTotalUsd = rps * sh
    }
  }

  const revenueTtm = revenueTotalUsd ?? pick(km, ['revenuePerShareTTM'])

  const ocfNiFromKm = pick(km, ['incomeQuality', 'operatingCashFlowRatio'])
  let ocfToNetIncome: number | undefined
  if (ocfNiFromKm !== undefined) {
    ocfToNetIncome = ocfNiFromKm
  }

  const ocfAbs = pick(cfSrc, [
    'operatingCashFlow',
    'netCashProvidedByOperatingActivities',
    'totalCashFromOperatingActivities',
    'cashFlowFromContinuingOperatingActivities',
  ])
  const niAbs = pick(incSrc, [
    'netIncome',
    'netIncomeCommonStockholders',
    'netIncomeApplicableToCommonShares',
    'netIncomeFromContinuingOperations',
  ])
  const fcfAbs = pick(cfSrc, ['freeCashFlow', 'freeCashFlowFromContinuingOperatingActivities'])
  const capexRaw = pick(cfSrc, [
    'capitalExpenditure',
    'investmentsInPropertyPlantAndEquipment',
    'purchaseOfPPE',
    'capitalExpenditures',
  ])
  const capexAbs = capexRaw !== undefined ? Math.abs(capexRaw) : undefined
  const revAbs = pick(incSrc, ['revenue', 'sales', 'totalRevenue'])
  const opEx = pick(incSrc, ['operatingExpenses', 'totalOperatingExpenses', 'sellingGeneralAndAdministrativeExpenses'])
  const interestExp = pick(incSrc, ['interestExpense'])
  const interestInc = pick(incSrc, ['interestIncome', 'interestIncomeExpense'])

  if (interestCoverage === undefined || !Number.isFinite(interestCoverage)) {
    const ebitLike = pick(incSrc, ['ebit', 'EBIT', 'operatingIncome'])
    const ieMag = interestExp !== undefined ? Math.abs(interestExp) : undefined
    if (ebitLike !== undefined && ieMag !== undefined && ieMag > 1e-6) {
      interestCoverage = ebitLike / ieMag
    }
  }

  if (ocfAbs !== undefined && niAbs !== undefined && Math.abs(niAbs) > 1e-6) {
    ocfToNetIncome = ocfAbs / niAbs
  }

  const grossProfitLine = pick(incSrc, ['grossProfit'])
  let grossProfitApprox: number | undefined = grossProfitLine
  if (grossProfitApprox === undefined && revenueTotalUsd !== undefined && grossMargin !== undefined) {
    grossProfitApprox = revenueTotalUsd * grossMargin
  }
  if (grossProfitApprox === undefined && revenueTotalUsd !== undefined) {
    const cogs = pick(incSrc, ['costOfRevenue', 'costOfGoodsSold', 'costOfSales', 'costOfGoodsAndServicesSold'])
    if (cogs !== undefined && revenueTotalUsd > cogs) {
      grossProfitApprox = revenueTotalUsd - cogs
    }
  }
  let enterpriseValueToGrossProfit: number | undefined
  if (enterpriseValue !== undefined && grossProfitApprox !== undefined && grossProfitApprox !== 0) {
    enterpriseValueToGrossProfit = enterpriseValue / grossProfitApprox
  }

  let enterpriseValueToRevenue: number | undefined
  if (enterpriseValue !== undefined && revenueTotalUsd !== undefined && revenueTotalUsd !== 0) {
    enterpriseValueToRevenue = enterpriseValue / revenueTotalUsd
  }

  if ((fcfYield === undefined || !Number.isFinite(fcfYield)) && fcfAbs !== undefined && marketCap !== undefined && marketCap > 1e-6) {
    fcfYield = fcfAbs / marketCap
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

  if (
    (netDebtToEbitda === undefined || !Number.isFinite(netDebtToEbitda)) &&
    totalDebtBs !== undefined &&
    cashAndEquivalents !== undefined
  ) {
    let ebitdaTtm =
      pick(incSrc, ['ebitda', 'EBITDA']) ??
      pick(km, ['ebitda', 'EBITDA']) ??
      pick(incAnnual0, ['ebitda', 'EBITDA'])
    if (ebitdaTtm === undefined) {
      const oi = pick(incSrc, ['operatingIncome'])
      const da = pick(incSrc, ['depreciationAndAmortization', 'reconciledDepreciation'])
      if (oi !== undefined && da !== undefined && Number.isFinite(oi) && Number.isFinite(da)) {
        ebitdaTtm = oi + da
      }
    }
    if (ebitdaTtm !== undefined && Math.abs(ebitdaTtm) > 1e-6) {
      const netDebt = totalDebtBs - cashAndEquivalents
      netDebtToEbitda = netDebt / ebitdaTtm
    }
  }

  if (
    (enterpriseValue === undefined || !Number.isFinite(enterpriseValue)) &&
    marketCap !== undefined &&
    marketCap > 1e-6 &&
    totalDebtBs !== undefined &&
    cashAndEquivalents !== undefined
  ) {
    enterpriseValue = marketCap + totalDebtBs - cashAndEquivalents
  }
  if (enterpriseValue !== undefined && grossProfitApprox !== undefined && grossProfitApprox !== 0) {
    enterpriseValueToGrossProfit = enterpriseValue / grossProfitApprox
  }
  if (enterpriseValue !== undefined && revenueTotalUsd !== undefined && revenueTotalUsd !== 0) {
    enterpriseValueToRevenue = enterpriseValue / revenueTotalUsd
  }

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

  const ebitLikeForEv = pick(incSrc, ['ebit', 'EBIT']) ?? pick(incSrc, ['operatingIncome'])
  const opIncForMargin = pick(incSrc, ['operatingIncome'])
  const revForMargins = revenueTotalUsd ?? revAbs

  if (
    (operatingMargin === undefined || !Number.isFinite(operatingMargin)) &&
    opIncForMargin !== undefined &&
    revForMargins !== undefined &&
    revForMargins > 0
  ) {
    operatingMargin = opIncForMargin / revForMargins
  }

  if (
    (roe === undefined || !Number.isFinite(roe)) &&
    niAbs !== undefined &&
    totalEquity !== undefined &&
    totalEquity > 1e-6
  ) {
    roe = normalizeMarginRatio(niAbs / totalEquity) ?? niAbs / totalEquity
  }

  if (
    (roic === undefined || !Number.isFinite(roic)) &&
    ebitLikeForEv !== undefined &&
    Math.abs(ebitLikeForEv) > 1e-6 &&
    totalEquity !== undefined &&
    totalDebtBs !== undefined &&
    cashAndEquivalents !== undefined
  ) {
    const investedCapital = totalEquity + totalDebtBs - cashAndEquivalents
    if (investedCapital > 1e-6) {
      const pretax = pick(incSrc, ['incomeBeforeTax', 'incomeBeforeIncomeTaxes'])
      const taxExp = pick(incSrc, ['incomeTaxExpense'])
      let nopat = ebitLikeForEv
      if (
        pretax !== undefined &&
        pretax > 1e-6 &&
        taxExp !== undefined &&
        Number.isFinite(taxExp)
      ) {
        const tEff = Math.min(0.55, Math.max(0, taxExp / pretax))
        nopat = ebitLikeForEv * (1 - tEff)
      }
      roic = normalizeMarginRatio(nopat / investedCapital) ?? nopat / investedCapital
    }
  }

  if (
    (evToEbit === undefined || !Number.isFinite(evToEbit)) &&
    enterpriseValue !== undefined &&
    ebitLikeForEv !== undefined &&
    Math.abs(ebitLikeForEv) > 1e-6
  ) {
    evToEbit = enterpriseValue / ebitLikeForEv
  }

  if (
    (peTrailing === undefined || !Number.isFinite(peTrailing) || peTrailing <= 0) &&
    price !== undefined &&
    price > 0
  ) {
    const epsTtm = pick(incSrc, ['epsdiluted', 'eps'])
    if (epsTtm !== undefined && epsTtm > 0) {
      peTrailing = price / epsTtm
    }
  }

  if (pegRatio === undefined || !Number.isFinite(pegRatio) || pegRatio <= 0) {
    pegRatio = computePegFallback(peTrailing, km, r, annualEps, pack.analystEstimates)
  }

  const epsGrowthPercent = epsGrowthPercentForPeg(km, r, annualEps, pack.analystEstimates)

  return {
    symbol: symbol.toUpperCase(),
    companyName,
    sector,
    industry,
    headquarters,
    mktCap: marketCap,
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
    epsGrowthPercent,
  }
}
