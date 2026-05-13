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

export function buildCompanyFacts(symbol: string, pack: CompanyRawPack): CompanyFacts {
  const p = pack.profile
  const q = pack.quote
  const km = pack.keyMetricsTtm
  const r = pack.ratiosTtm
  const sc = pack.score

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

  const peTrailing = pick(q, ['pe']) ?? pick(km, ['peRatio']) ?? pick(r, ['priceEarningsRatio'])
  const forwardPe = pick(r, ['forwardPriceToEarnings', 'forwardPE']) ?? pick(km, ['forwardPe', 'forwardPE'])
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

  const operatingCashFlowTtm = pick(km, ['operatingCashFlowPerShareTTM']) // per share not ideal
  const netIncomeTtm = pick(km, ['netIncomePerShareTTM'])
  const freeCashFlowTtm = pick(km, ['freeCashFlowPerShareTTM'])
  const revenueTtmTotal = pick(km, ['revenue']) ?? pick(km, ['revenuePerShareTTM'])
  const revenueTtm = revenueTtmTotal

  const ocfNiFromKm = pick(km, ['incomeQuality', 'operatingCashFlowRatio'])
  let ocfToNetIncome: number | undefined
  if (ocfNiFromKm !== undefined) {
    ocfToNetIncome = ocfNiFromKm
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

  return {
    symbol: symbol.toUpperCase(),
    companyName,
    sector,
    industry,
    mktCap: pick(q, ['marketCap']) ?? pick(p, ['mktCap']),
    price: pick(q, ['price']),
    priceToTangibleBook: (() => {
      const px = pick(q, ['price'])
      const tbv = pick(km, ['tangibleBookValuePerShare'])
      if (px !== undefined && tbv !== undefined && tbv > 0) return px / tbv
      return undefined
    })(),
    peTrailing,
    forwardPe,
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
  }
}
