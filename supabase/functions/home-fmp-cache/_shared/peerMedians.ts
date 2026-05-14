import { fmpGet } from './http.ts'
import { fmpPayloadHasErrorMessage } from './profileClassification.ts'
import { asArray, firstRow, median, num, normalizeMarginRatio, type JsonRecord } from './normalize.ts'

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

/** FMP sometimes returns yield as 2.5 (meaning 2.5%) instead of 0.025. */
function normalizeYieldLikeRatio(v: number | undefined): number | undefined {
  if (v === undefined || !Number.isFinite(v)) return undefined
  if (v > 1.25 && v <= 100) return v / 100
  return v
}

function extractPeerRow(
  km?: JsonRecord,
  incTtm?: JsonRecord,
  quote?: JsonRecord,
  incAnnual?: JsonRecord,
  cfTtm?: JsonRecord,
  cfAnnual?: JsonRecord,
) {
  if (!km || fmpPayloadHasErrorMessage(km)) return undefined
  const q = quote && !fmpPayloadHasErrorMessage(quote) ? quote : undefined
  const ia = incAnnual && !fmpPayloadHasErrorMessage(incAnnual) ? incAnnual : undefined
  const cft = cfTtm && !fmpPayloadHasErrorMessage(cfTtm) ? cfTtm : undefined
  const cfa = cfAnnual && !fmpPayloadHasErrorMessage(cfAnnual) ? cfAnnual : undefined
  /** Key-metrics TTM often omits market cap / EV; quote almost always has marketCap. */
  const mktCap = pick(km, ['marketCap']) ?? pick(q, ['marketCap'])
  const shOut =
    pick(km, ['weightedAverageShsOutDil', 'weightedAverageShsOut']) ??
    pick(q, ['sharesOutstanding', 'weightedAverageShsOutDil'])
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
  if (grossProfitApprox === undefined && ia) {
    const gpA = pick(ia, ['grossProfit'])
    if (gpA !== undefined) {
      grossProfitApprox = gpA
    } else {
      const revA = revenue ?? pick(ia, ['revenue', 'sales', 'totalRevenue'])
      const cogsA = pick(ia, [
        'costOfRevenue',
        'costOfGoodsSold',
        'costOfSales',
        'costOfGoodsAndServicesSold',
      ])
      if (revA !== undefined && cogsA !== undefined && revA > cogsA) {
        grossProfitApprox = revA - cogsA
        if (revenue === undefined) revenue = revA
      }
    }
  }

  if (revenue === undefined && ia) {
    const rOnly = pick(ia, ['revenue', 'sales', 'totalRevenue'])
    if (rOnly !== undefined) revenue = rOnly
  }

  let enterpriseValue =
    pick(km, ['enterpriseValue', 'enterpriseValueTTM']) ?? pick(q, ['enterpriseValue'])
  if (enterpriseValue === undefined || !Number.isFinite(enterpriseValue)) {
    if (mktCap !== undefined && mktCap > 1e-6) {
      const debt = totalDebtKm ?? 0
      const cash = cashKm ?? 0
      enterpriseValue = mktCap + debt - cash
    }
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

  let fcfYield = normalizeYieldLikeRatio(
    pick(km, ['freeCashFlowYield', 'fcfYield', 'freeCashFlowYieldTTM']),
  )
  const fcfAbs =
    pick(km, ['freeCashFlow', 'freeCashFlowTTM']) ??
    (cft ? pick(cft, ['freeCashFlow', 'freeCashFlowFromContinuingOperatingActivities']) : undefined) ??
    (cfa ? pick(cfa, ['freeCashFlow', 'freeCashFlowFromContinuingOperatingActivities']) : undefined)
  if ((fcfYield === undefined || !Number.isFinite(fcfYield)) && fcfAbs !== undefined && mktCap !== undefined && mktCap > 1e-6) {
    fcfYield = fcfAbs / mktCap
  }
  fcfYield = normalizeYieldLikeRatio(fcfYield)

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

  const ebitForEv =
    pick(km, ['ebit', 'EBIT', 'operatingIncome', 'operatingIncomeTTM']) ??
    (incTtm && !fmpPayloadHasErrorMessage(incTtm)
      ? pick(incTtm, ['ebit', 'EBIT', 'operatingIncome', 'operatingIncomeTTM'])
      : undefined) ??
    (ia ? pick(ia, ['ebit', 'EBIT', 'operatingIncome', 'operatingIncomeTTM']) : undefined)

  let evToEbit = pick(km, ['enterpriseValueOverEBIT', 'evToEBITTTM', 'evToEbit'])
  if (
    (evToEbit === undefined || !Number.isFinite(evToEbit)) &&
    enterpriseValue !== undefined &&
    ebitForEv !== undefined &&
    Math.abs(ebitForEv) > 1e-6
  ) {
    evToEbit = enterpriseValue / ebitForEv
  }

  let evToEbitda = pick(km, ['enterpriseValueOverEBITDA', 'evToEBITDATTM', 'evToEBITDA'])
  let ebitdaForEv =
    pick(km, ['ebitda', 'EBITDA']) ??
    (incTtm && !fmpPayloadHasErrorMessage(incTtm) ? pick(incTtm, ['ebitda', 'EBITDA']) : undefined) ??
    (ia ? pick(ia, ['ebitda', 'EBITDA']) : undefined)
  if (ebitdaForEv === undefined && incTtm && !fmpPayloadHasErrorMessage(incTtm)) {
    const oi = pick(incTtm, ['operatingIncome', 'ebit', 'EBIT'])
    const da = pick(incTtm, ['depreciationAndAmortization', 'reconciledDepreciation'])
    if (oi !== undefined && da !== undefined && Number.isFinite(oi) && Number.isFinite(da)) {
      ebitdaForEv = oi + da
    }
  }
  if (ebitdaForEv === undefined && ia) {
    const oi = pick(ia, ['operatingIncome', 'ebit', 'EBIT'])
    const da = pick(ia, ['depreciationAndAmortization', 'reconciledDepreciation'])
    if (oi !== undefined && da !== undefined && Number.isFinite(oi) && Number.isFinite(da)) {
      ebitdaForEv = oi + da
    }
  }
  if (
    (evToEbitda === undefined || !Number.isFinite(evToEbitda)) &&
    enterpriseValue !== undefined &&
    ebitdaForEv !== undefined &&
    Math.abs(ebitdaForEv) > 1e-6
  ) {
    evToEbitda = enterpriseValue / ebitdaForEv
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
    evToEbitda,
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
          const [kmRaw, incTtmRaw, quoteRaw, incAnnRaw, cfTtmRaw, cfAnnRaw] = await Promise.all([
            fmpGet<unknown>(`/stable/key-metrics-ttm?symbol=${encodeURIComponent(sym)}`, apiKey),
            fmpGet<unknown>(`/stable/income-statement-ttm?symbol=${encodeURIComponent(sym)}`, apiKey).catch(
              () => null,
            ),
            fmpGet<unknown>(`/stable/quote?symbol=${encodeURIComponent(sym)}`, apiKey).catch(() => null),
            fmpGet<unknown>(
              `/stable/income-statement?symbol=${encodeURIComponent(sym)}&period=annual&limit=1`,
              apiKey,
            ).catch(() => null),
            fmpGet<unknown>(`/stable/cash-flow-statement-ttm?symbol=${encodeURIComponent(sym)}`, apiKey).catch(
              () => null,
            ),
            fmpGet<unknown>(
              `/stable/cash-flow-statement?symbol=${encodeURIComponent(sym)}&period=annual&limit=1`,
              apiKey,
            ).catch(() => null),
          ])
          if (fmpPayloadHasErrorMessage(kmRaw)) return undefined
          const kmRows = asArray<JsonRecord>(kmRaw)
          const km = firstRow(kmRows)
          const incRows =
            incTtmRaw === null || fmpPayloadHasErrorMessage(incTtmRaw) ? [] : asArray<JsonRecord>(incTtmRaw)
          const inc = firstRow(incRows)
          const quoteRows =
            quoteRaw === null || fmpPayloadHasErrorMessage(quoteRaw) ? [] : asArray<JsonRecord>(quoteRaw)
          const qt = firstRow(quoteRows)
          const annRows =
            incAnnRaw === null || fmpPayloadHasErrorMessage(incAnnRaw) ? [] : asArray<JsonRecord>(incAnnRaw)
          const incAnnual = firstRow(annRows)
          const cfTtmRows =
            cfTtmRaw === null || fmpPayloadHasErrorMessage(cfTtmRaw) ? [] : asArray<JsonRecord>(cfTtmRaw)
          const cfTtm = firstRow(cfTtmRows)
          const cfAnnRows =
            cfAnnRaw === null || fmpPayloadHasErrorMessage(cfAnnRaw) ? [] : asArray<JsonRecord>(cfAnnRaw)
          const cfAnnual = firstRow(cfAnnRows)
          return extractPeerRow(km, inc, qt, incAnnual, cfTtm, cfAnnual)
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
