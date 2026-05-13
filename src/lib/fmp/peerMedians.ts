import { fmpGet } from './http'
import { asArray, firstRow, median, num, type JsonRecord } from './normalize'

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

function pick(o: JsonRecord | undefined, keys: string[]): number | undefined {
  if (!o) return undefined
  for (const k of keys) {
    const n = num(o[k])
    if (n !== undefined) return n
  }
  return undefined
}

function extractPeerRow(km?: JsonRecord) {
  if (!km) return undefined
  const enterpriseValue = pick(km, ['enterpriseValue'])
  const grossMargin = pick(km, ['grossProfitMargin'])
  const revenue = pick(km, ['revenue']) ?? pick(km, ['revenuePerShareTTM'])
  const grossProfitApprox =
    revenue !== undefined && grossMargin !== undefined ? revenue * grossMargin : undefined
  let enterpriseValueToGrossProfit: number | undefined
  if (enterpriseValue !== undefined && grossProfitApprox !== undefined && grossProfitApprox !== 0) {
    enterpriseValueToGrossProfit = enterpriseValue / grossProfitApprox
  }
  let enterpriseValueToRevenue: number | undefined
  if (enterpriseValue !== undefined && revenue !== undefined && revenue !== 0) {
    enterpriseValueToRevenue = enterpriseValue / revenue
  }

  const mktCap = pick(km, ['marketCap'])
  const shOut = pick(km, ['weightedAverageShsOutDil', 'weightedAverageShsOut'])
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

  return {
    evToEbitda: pick(km, ['enterpriseValueOverEBITDA', 'evToEBITDATTM']),
    evToEbit: pick(km, ['enterpriseValueOverEBIT', 'evToEBITTTM']),
    fcfYield: pick(km, ['freeCashFlowYield']),
    roe: pick(km, ['roe']),
    roa: pick(km, ['returnOnAssets', 'roa']),
    roic: pick(km, ['roic']),
    priceToBook: pick(km, ['pbRatio', 'priceToBookRatio']),
    peTrailing: pick(km, ['peRatio']),
    operatingMargin: pick(km, ['operatingProfitMargin']),
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
  options?: { maxPeers?: number; batchSize?: number },
): Promise<PeerMedians> {
  const maxPeers = options?.maxPeers ?? 14
  const batchSize = options?.batchSize ?? 5
  const slice = peers.slice(0, maxPeers)

  const rows: ReturnType<typeof extractPeerRow>[] = []
  for (let i = 0; i < slice.length; i += batchSize) {
    const batch = slice.slice(i, i + batchSize)
    const part = await Promise.all(
      batch.map(async (sym) => {
        try {
          const raw = await fmpGet<unknown>(
            `/stable/key-metrics-ttm?symbol=${encodeURIComponent(sym)}`,
            apiKey,
          )
          const rows = asArray<JsonRecord>(raw)
          return extractPeerRow(firstRow(rows))
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
