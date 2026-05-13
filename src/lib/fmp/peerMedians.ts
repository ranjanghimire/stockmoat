import { fmpGet } from './http'
import { fmpPayloadHasErrorMessage } from './profileClassification'
import { asArray, firstRow, median, num, normalizeMarginRatio, type JsonRecord } from './normalize'

export interface PeerMedians {
  n: number
  evToEbitda?: number
  evToEbit?: number
  fcfYield?: number
  roe?: number
  roa?: number
  roic?: number
  priceToBook?: number
  peTrailing?: number
  operatingMargin?: number
  ebitdaMargin?: number
  enterpriseValueToRevenue?: number
  enterpriseValueToGrossProfit?: number
  /** Implied price / FFO from market cap ÷ shares ÷ FFO per share (key-metrics TTM). */
  priceToFfo?: number
  bankEfficiencyRatio?: number
  nonPerformingLoansRatio?: number
  /** FMP growth fields normalized to ~percent points when possible. */
  revenueGrowth3Y?: number
}

export const EMPTY_PEER_MEDIANS: PeerMedians = { n: 0 }

/** When FMP stock-peers returns nothing, still compute medians vs large-cap tech / growth names. */
const FALLBACK_PEER_UNIVERSE = [
  'AAPL',
  'GOOGL',
  'GOOG',
  'AMZN',
  'META',
  'NVDA',
  'AVGO',
  'ORCL',
  'CSCO',
  'ADBE',
  'CRM',
  'INTC',
  'IBM',
  'QCOM',
  'AMD',
  'TXN',
  'NOW',
  'UBER',
] as const

function peerSymbolsForRun(subject: string | undefined, fmpPeers: string[], maxPeers: number): string[] {
  const sub = (subject ?? '').trim().toUpperCase()
  const primary = fmpPeers.filter((p) => p.trim().toUpperCase() !== sub)
  if (primary.length > 0) return primary.slice(0, maxPeers)
  if (!sub) return fmpPeers.slice(0, maxPeers)
  return FALLBACK_PEER_UNIVERSE.filter((p) => p !== sub).slice(0, maxPeers)
}

function pick(o: JsonRecord | undefined, keys: string[]): number | undefined {
  if (!o) return undefined
  for (const k of keys) {
    const n = num(o[k])
    if (n !== undefined) return n
  }
  return undefined
}

function extractPeerRow(km?: JsonRecord, incTtm?: JsonRecord) {
  if (!km || fmpPayloadHasErrorMessage(km)) return undefined
  const mktCap = pick(km, ['marketCap'])
  const shOut = pick(km, ['weightedAverageShsOutDil', 'weightedAverageShsOut'])
  let revenue = pick(km, ['revenue', 'totalRevenue'])
  if (revenue === undefined) {
    const rps = pick(km, ['revenuePerShareTTM', 'revenuePerShare'])
    if (rps !== undefined && shOut !== undefined && shOut > 0) {
      revenue = rps * shOut
    }
  }
  if (revenue === undefined && incTtm && !fmpPayloadHasErrorMessage(incTtm)) {
    const rInc = pick(incTtm, ['revenue', 'sales', 'totalRevenue'])
    if (rInc !== undefined) revenue = rInc
  }

  const totalDebtKm = pick(km, ['totalDebt'])
  const cashKm = pick(km, ['cashAndCashEquivalents', 'cashAndShortTermInvestments', 'cash'])

  const grossMargin = normalizeMarginRatio(
    pick(km, ['grossProfitMargin', 'grossMargin', 'grossProfitRatio']),
  )
  const grossProfitDirect = pick(km, ['grossProfit', 'grossProfitTTM'])
  let grossProfitApprox: number | undefined = grossProfitDirect
  if (grossProfitApprox === undefined && revenue !== undefined && grossMargin !== undefined) {
    grossProfitApprox = revenue * grossMargin
  }
  if (grossProfitApprox === undefined && revenue !== undefined) {
    const cogs = pick(km, ['costOfRevenue', 'costOfGoodsSold', 'costOfSales', 'costOfGoodsAndServicesSold'])
    if (cogs !== undefined && revenue > cogs) {
      grossProfitApprox = revenue - cogs
    }
  }
  if (grossProfitApprox === undefined && incTtm && !fmpPayloadHasErrorMessage(incTtm)) {
    const gpInc = pick(incTtm, ['grossProfit'])
    if (gpInc !== undefined) {
      grossProfitApprox = gpInc
    } else {
      const revInc = revenue ?? pick(incTtm, ['revenue', 'sales', 'totalRevenue'])
      const cogsInc = pick(incTtm, [
        'costOfRevenue',
        'costOfGoodsSold',
        'costOfSales',
        'costOfGoodsAndServicesSold',
      ])
      if (revInc !== undefined && cogsInc !== undefined && revInc > cogsInc) {
        grossProfitApprox = revInc - cogsInc
        if (revenue === undefined) revenue = revInc
      }
    }
  }

  let enterpriseValue = pick(km, ['enterpriseValue', 'enterpriseValueTTM'])
  if (
    (enterpriseValue === undefined || !Number.isFinite(enterpriseValue)) &&
    mktCap !== undefined &&
    mktCap > 1e-6 &&
    totalDebtKm !== undefined &&
    cashKm !== undefined
  ) {
    enterpriseValue = mktCap + totalDebtKm - cashKm
  }

  let enterpriseValueToGrossProfit: number | undefined
  if (
    enterpriseValue !== undefined &&
    grossProfitApprox !== undefined &&
    grossProfitApprox > 1e-9
  ) {
    enterpriseValueToGrossProfit = enterpriseValue / grossProfitApprox
  }
  let enterpriseValueToRevenue: number | undefined
  if (enterpriseValue !== undefined && revenue !== undefined && revenue !== 0) {
    enterpriseValueToRevenue = enterpriseValue / revenue
  }

  const impliedPrice =
    mktCap !== undefined && shOut !== undefined && shOut > 0 ? mktCap / shOut : undefined
  const ffoPs = pick(km, ['ffoPerShareTTM', 'fundsFromOperationsPerShareTTM', 'operatingCashFlowPerShareTTM'])
  let priceToFfo: number | undefined
  if (impliedPrice !== undefined && ffoPs !== undefined && ffoPs > 0) {
    priceToFfo = impliedPrice / ffoPs
  }

  const bankEfficiencyRatio = pick(km, ['bankEfficiencyRatio', 'efficiencyRatio'])

  const rawGrowth = pick(km, ['revenueGrowth3Y', 'threeYRevenueGrowthPerShare', 'growthThreeY'])
  let revenueGrowth3Y: number | undefined
  if (rawGrowth !== undefined) {
    revenueGrowth3Y = Math.abs(rawGrowth) <= 2 ? rawGrowth * 100 : rawGrowth
  }

  let fcfYield = pick(km, ['freeCashFlowYield'])
  const fcfAbs = pick(km, ['freeCashFlow'])
  if ((fcfYield === undefined || !Number.isFinite(fcfYield)) && fcfAbs !== undefined && mktCap !== undefined && mktCap > 1e-6) {
    fcfYield = fcfAbs / mktCap
  }

  let roe = normalizeMarginRatio(pick(km, ['roe', 'returnOnEquity']))
  const netIncKm = pick(km, ['netIncome', 'netIncomeTTM'])
  const eqKm = pick(km, ['totalStockholdersEquity', 'totalEquity'])
  if (
    (roe === undefined || !Number.isFinite(roe)) &&
    netIncKm !== undefined &&
    eqKm !== undefined &&
    eqKm > 1e-6
  ) {
    roe = normalizeMarginRatio(netIncKm / eqKm) ?? netIncKm / eqKm
  }

  let operatingMargin = normalizeMarginRatio(pick(km, ['operatingProfitMargin', 'operatingMargin']))
  const opIncKm = pick(km, ['operatingIncome', 'operatingIncomeTTM'])
  if (
    (operatingMargin === undefined || !Number.isFinite(operatingMargin)) &&
    opIncKm !== undefined &&
    revenue !== undefined &&
    revenue > 0
  ) {
    operatingMargin = opIncKm / revenue
  }

  let roic = normalizeMarginRatio(pick(km, ['roic', 'returnOnInvestedCapital']))
  if (
    (roic === undefined || !Number.isFinite(roic)) &&
    opIncKm !== undefined &&
    eqKm !== undefined &&
    totalDebtKm !== undefined &&
    cashKm !== undefined
  ) {
    const invCapPeer = eqKm + totalDebtKm - cashKm
    if (invCapPeer > 1e-6) {
      roic = normalizeMarginRatio(opIncKm / invCapPeer) ?? opIncKm / invCapPeer
    }
  }

  let evToEbit = pick(km, ['enterpriseValueOverEBIT', 'evToEBITTTM', 'evToEbit'])
  const ebitKm = pick(km, ['ebit', 'operatingIncome', 'operatingIncomeTTM'])
  if (
    (evToEbit === undefined || !Number.isFinite(evToEbit)) &&
    enterpriseValue !== undefined &&
    ebitKm !== undefined &&
    Math.abs(ebitKm) > 1e-6
  ) {
    evToEbit = enterpriseValue / ebitKm
  }

  let peTrailing = pick(km, ['peRatio', 'trailingPE', 'trailingPe'])
  const niPs = pick(km, ['netIncomePerShareTTM'])
  if (
    (peTrailing === undefined || !Number.isFinite(peTrailing) || peTrailing <= 0) &&
    impliedPrice !== undefined &&
    niPs !== undefined &&
    niPs > 0
  ) {
    peTrailing = impliedPrice / niPs
  }

  return {
    evToEbitda: pick(km, ['enterpriseValueOverEBITDA', 'evToEBITDATTM']),
    evToEbit,
    fcfYield,
    roe,
    roa: pick(km, ['returnOnAssets', 'roa']),
    roic,
    priceToBook: pick(km, ['pbRatio', 'priceToBookRatio']),
    peTrailing,
    operatingMargin,
    ebitdaMargin: pick(km, ['ebitdaMargin']),
    enterpriseValueToRevenue,
    enterpriseValueToGrossProfit,
    priceToFfo,
    bankEfficiencyRatio,
    nonPerformingLoansRatio: pick(km, ['nonPerformingLoansToLoansRatio', 'nonPerformingLoansRatio', 'nplRatio']),
    revenueGrowth3Y,
  }
}

export async function fetchPeerMedians(
  peers: string[],
  apiKey: string,
  options?: { maxPeers?: number; batchSize?: number; subjectSymbol?: string },
): Promise<PeerMedians> {
  const maxPeers = options?.maxPeers ?? 14
  const batchSize = options?.batchSize ?? 5
  const slice = peerSymbolsForRun(options?.subjectSymbol, peers, maxPeers)

  const rows: ReturnType<typeof extractPeerRow>[] = []
  for (let i = 0; i < slice.length; i += batchSize) {
    const batch = slice.slice(i, i + batchSize)
    const part = await Promise.all(
      batch.map(async (sym) => {
        try {
          const [kmRaw, incRaw] = await Promise.all([
            fmpGet<unknown>(`/stable/key-metrics-ttm?symbol=${encodeURIComponent(sym)}`, apiKey),
            fmpGet<unknown>(`/stable/income-statement-ttm?symbol=${encodeURIComponent(sym)}`, apiKey).catch(
              () => null,
            ),
          ])
          if (fmpPayloadHasErrorMessage(kmRaw)) return undefined
          const kmRows = asArray<JsonRecord>(kmRaw)
          const km = firstRow(kmRows)
          const incRows =
            incRaw === null || fmpPayloadHasErrorMessage(incRaw) ? [] : asArray<JsonRecord>(incRaw)
          const inc = firstRow(incRows)
          return extractPeerRow(km, inc)
        } catch {
          return undefined
        }
      }),
    )
    rows.push(...part)
  }

  const valid = rows.filter((r): r is NonNullable<typeof r> => Boolean(r))

  const evToEbitda = median(valid.map((v) => v.evToEbitda).filter((v): v is number => v !== undefined && v > 0))
  const evToEbit = median(valid.map((v) => v.evToEbit).filter((v): v is number => v !== undefined && v > 0))
  const fcfYield = median(valid.map((v) => v.fcfYield).filter((v): v is number => v !== undefined))
  const roe = median(valid.map((v) => v.roe).filter((v): v is number => v !== undefined))
  const roa = median(valid.map((v) => v.roa).filter((v): v is number => v !== undefined))
  const roic = median(valid.map((v) => v.roic).filter((v): v is number => v !== undefined))
  const priceToBook = median(valid.map((v) => v.priceToBook).filter((v): v is number => v !== undefined && v > 0))
  const peTrailing = median(valid.map((v) => v.peTrailing).filter((v): v is number => v !== undefined && v > 0))
  const operatingMargin = median(
    valid.map((v) => v.operatingMargin).filter((v): v is number => v !== undefined),
  )
  const ebitdaMargin = median(valid.map((v) => v.ebitdaMargin).filter((v): v is number => v !== undefined))
  const enterpriseValueToRevenue = median(
    valid.map((v) => v.enterpriseValueToRevenue).filter((v): v is number => v !== undefined && v > 0),
  )
  const enterpriseValueToGrossProfit = median(
    valid.map((v) => v.enterpriseValueToGrossProfit).filter((v): v is number => v !== undefined && v > 0),
  )
  const priceToFfo = median(valid.map((v) => v.priceToFfo).filter((v): v is number => v !== undefined && v > 0))
  const bankEfficiencyRatio = median(
    valid.map((v) => v.bankEfficiencyRatio).filter((v): v is number => v !== undefined && v > 0),
  )
  const nonPerformingLoansRatio = median(
    valid.map((v) => v.nonPerformingLoansRatio).filter((v): v is number => v !== undefined && v >= 0),
  )
  const revenueGrowth3Y = median(
    valid.map((v) => v.revenueGrowth3Y).filter((v): v is number => v !== undefined),
  )

  return {
    n: valid.length,
    evToEbitda,
    evToEbit,
    fcfYield,
    roe,
    roa,
    roic,
    priceToBook,
    peTrailing,
    operatingMargin,
    ebitdaMargin,
    enterpriseValueToRevenue,
    enterpriseValueToGrossProfit,
    priceToFfo,
    bankEfficiencyRatio,
    nonPerformingLoansRatio,
    revenueGrowth3Y,
  }
}
